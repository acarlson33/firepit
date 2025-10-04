"use server";
import { Query } from "appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getAppwriteIds } from "@/lib/appwrite-config";
import { getUserRoles } from "@/lib/appwrite-roles";
import { recordMetric, recordTiming } from "@/lib/monitoring";

// Server actions run on the server; use server-side env variables first.
const ids = getAppwriteIds();
const databaseId = ids.databaseId;
const messagesCollection = ids.messages;
const channelsCollection = ids.channels;

export type BackfillResult = {
  updated: number;
  scanned: number;
  remaining: number;
};

// Smaller helpers to keep complexity below threshold
async function listMessagesNeedingServerId(limit: number) {
  const { databases } = getAdminClient();
  try {
    const res = await databases.listDocuments(databaseId, messagesCollection, [
      Query.limit(limit),
      Query.isNull("serverId"),
      Query.orderAsc("$createdAt"),
    ]);
    return (
      ((res as unknown as { documents?: unknown[] }).documents as
        | Record<string, unknown>[]
        | undefined) || []
    );
  } catch {
    return [];
  }
}

async function buildChannelServerMap(
  channelIds: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!channelIds.length) {
    return map;
  }
  try {
    const { databases } = getAdminClient();
    const res = await databases.listDocuments(databaseId, channelsCollection, [
      Query.equal("$id", channelIds),
      Query.limit(channelIds.length),
    ]);
    const list = (res as unknown as { documents?: unknown[] }).documents || [];
    for (const raw of list) {
      const c = raw as Record<string, unknown>;
      if (c.$id && c.serverId) {
        map[String(c.$id)] = String(c.serverId);
      }
    }
  } catch {
    // swallow channel lookup errors
  }
  return map;
}

async function updateMessageServerIds(
  docs: Record<string, unknown>[],
  channelMap: Record<string, string>
) {
  let updated = 0;
  for (const d of docs) {
    const channelId = d.channelId as string | undefined;
    if (!channelId) {
      continue;
    }
    const serverId = channelMap[channelId];
    if (!serverId) {
      continue;
    }
    try {
      const { databases } = getAdminClient();
      await databases.updateDocument(
        databaseId,
        messagesCollection,
        String(d.$id),
        { serverId }
      );
      updated += 1;
    } catch {
      // ignore single failure
    }
  }
  return updated;
}

export async function backfillServerIds(
  userId: string
): Promise<BackfillResult> {
  const start = Date.now();
  const roles = await getUserRoles(userId);
  if (!roles.isAdmin) {
    throw new Error("Forbidden");
  }
  const limit = 100;
  const docs = await listMessagesNeedingServerId(limit);
  const channelIds = Array.from(
    new Set(docs.map((d) => d.channelId).filter(Boolean))
  ) as string[];
  const channelMap = await buildChannelServerMap(channelIds);
  const updated = await updateMessageServerIds(docs, channelMap);
  const remaining =
    docs.length === limit ? limit : Math.max(0, docs.length - updated);
  recordMetric("admin.backfill_server_ids.count", updated);
  recordTiming("admin.backfill_server_ids.ms", start, { updated });
  return { updated, scanned: docs.length, remaining };
}
