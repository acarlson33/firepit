import { ID, Query } from "appwrite";

import {
  getBrowserDatabases,
  getEnvConfig,
} from "./appwrite-core";
import type { Message } from "./types";

// Environment derived identifiers (centralized)
const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const COLLECTION_ID = env.collections.messages;
const TYPING_COLLECTION_ID = env.collections.typing || undefined;

export type ListOptions = {
  limit?: number;
  cursorAfter?: string;
  channelId?: string;
  order?: "asc" | "desc";
};

function getDatabases() {
  return getBrowserDatabases();
}

export async function listMessages(opts: ListOptions = {}): Promise<Message[]> {
  const queries = buildMessageListQueries(opts);
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    queries,
  });
  return mapMessageDocs(
    (res as unknown as { documents?: unknown[] }).documents || []
  );
}

function buildMessageListQueries(opts: ListOptions) {
  const q: string[] = [];
  if (opts.limit) {
    q.push(Query.limit(opts.limit));
  }
  if (opts.cursorAfter) {
    q.push(Query.cursorAfter(opts.cursorAfter));
  }
  if (opts.channelId) {
    q.push(Query.equal("channelId", opts.channelId));
  }
  q.push(
    opts.order === "desc"
      ? Query.orderDesc("$createdAt")
      : Query.orderAsc("$createdAt")
  );
  return q;
}

function mapMessageDocs(list: unknown[]): Message[] {
  const out: Message[] = [];
  for (const raw of list) {
    const m = coerceMessage(raw);
    if (m) {
      out.push(m);
    }
  }
  return out;
}

function coerceMessage(raw: unknown): Message | null {
  if (typeof raw !== "object" || !raw || !("$id" in raw)) {
    return null;
  }
  const d = raw as Record<string, unknown> & { $id: string };
  return {
    $id: String(d.$id),
    userId: String(d.userId),
    userName: typeof d.userName === "string" ? d.userName : undefined,
    text: String(d.text),
    $createdAt: String(d.$createdAt ?? ""),
    channelId: typeof d.channelId === "string" ? d.channelId : undefined,
    editedAt: typeof d.editedAt === "string" ? d.editedAt : undefined,
    removedAt: typeof d.removedAt === "string" ? d.removedAt : undefined,
    removedBy: typeof d.removedBy === "string" ? d.removedBy : undefined,
    serverId: typeof d.serverId === "string" ? d.serverId : undefined,
  };
}

type SendMessageInput = {
  userId: string;
  text: string;
  userName?: string;
  channelId?: string;
  serverId?: string;
};

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const { userId, text, userName, channelId, serverId } = input;
  // Import Permission and Role from appwrite for client SDK
  const { Permission, Role } = await import("appwrite");
  const permissions = [
    Permission.read(Role.any()),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
  const res = await getDatabases().createDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    documentId: ID.unique(),
    data: { userId, text, userName, channelId, serverId },
    permissions,
  });
  const doc = res as unknown as Record<string, unknown>;
  return {
    $id: String(doc.$id),
    userId: String(doc.userId),
    userName: doc.userName as string | undefined,
    text: String(doc.text),
    $createdAt: String(doc.$createdAt ?? ""),
    channelId: doc.channelId as string | undefined,
    removedAt: doc.removedAt as string | undefined,
    removedBy: doc.removedBy as string | undefined,
    serverId: doc.serverId as string | undefined,
  };
}

export async function editMessage(messageId: string, text: string) {
  const editedAt = new Date().toISOString();
  const res = await getDatabases().updateDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    documentId: messageId,
    data: { text, editedAt },
  });
  return res as unknown as Message;
}

export async function deleteMessage(messageId: string) {
  await getDatabases().deleteDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    documentId: messageId,
  });
}

// Soft delete (moderation) – marks message as removed but keeps for audit
export async function softDeleteMessage(
  messageId: string,
  moderatorId: string
) {
  const removedAt = new Date().toISOString();
  const res = await getDatabases().updateDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    documentId: messageId,
    data: { removedAt, removedBy: moderatorId },
  });
  return res as unknown as Message;
}

export async function restoreMessage(messageId: string) {
  const res = await getDatabases().updateDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTION_ID,
    documentId: messageId,
    data: { removedAt: null, removedBy: null },
  });
  return res as unknown as Message;
}

// Typing indicator: create/update ephemeral doc per user+channel; requires a dedicated collection (optional)
export async function setTyping(
  userId: string,
  channelId: string,
  userName: string | undefined,
  isTyping: boolean
) {
  if (!TYPING_COLLECTION_ID) {
    return;
  }
  const key = `${userId}_${channelId}`;
  try {
    if (isTyping) {
      // Emulate upsert: try update, fallback create.
      const db = getDatabases();
      const payload = {
        userId,
        userName,
        channelId,
        updatedAt: new Date().toISOString(),
      };
      try {
        await db.updateDocument(
          DATABASE_ID,
          TYPING_COLLECTION_ID,
          key,
          payload
        );
      } catch {
        try {
          const { Permission, Role } = await import("appwrite");
          const typingPerms = [Permission.read(Role.any())];
          await db.createDocument(
            DATABASE_ID,
            TYPING_COLLECTION_ID,
            key,
            payload,
            typingPerms
          );
        } catch {
          // swallow; ephemeral
        }
      }
    } else {
      await getDatabases().deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: TYPING_COLLECTION_ID,
        documentId: key,
      });
    }
  } catch {
    // swallow; ephemeral
  }
}

// Basic flood protection heuristic client-side
const recent: string[] = [];
const FLOOD_WINDOW_MS = 5000;
const FLOOD_MAX_MESSAGES = 8;
export function canSend() {
  const now = Date.now();
  const cutoff = now - FLOOD_WINDOW_MS;
  while (recent.length && Number(recent[0]) < cutoff) {
    recent.shift();
  }
  if (recent.length >= FLOOD_MAX_MESSAGES) {
    return false;
  }
  recent.push(String(now));
  return true;
}

// Helper: fetch recent messages (returns ascending order for straightforward rendering)
export async function listRecentMessages(
  limit = 30,
  cursorAfter?: string,
  channelId?: string
) {
  const page = await listMessages({
    limit,
    cursorAfter,
    channelId,
    order: "desc",
  });
  return page.reverse();
}
