import { ID, Query } from "appwrite";

import {
  getBrowserDatabases,
  getEnvConfig,
  materializePermissions,
  normalizeError,
  perms,
  withSession,
} from "./appwrite-core";
import type { Channel, Membership, Server } from "./types";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || undefined;
const MAX_LIST_LIMIT = 500; // upper bound used for bulk listing
const DEFAULT_SERVER_PAGE_SIZE = 25;
const DEFAULT_CHANNEL_PAGE_SIZE = 50;
// Authorization diagnostics constants
// (Unauthorized diagnostics constants removed after refactor to normalized errors)

function getDatabases() {
  return getBrowserDatabases();
}

export async function listServers(limit = 100): Promise<Server[]> {
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: SERVERS_COLLECTION_ID,
    // Use system attribute $createdAt for ordering to avoid schema attribute requirement
    queries: [Query.limit(limit), Query.orderAsc("$createdAt")],
  });
  return res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      name: String(d.name),
      $createdAt: String(d.$createdAt ?? ""),
      ownerId: String(d.ownerId),
    } satisfies Server;
  });
}

export async function listServersPage(
  limit = DEFAULT_SERVER_PAGE_SIZE,
  cursorAfter?: string
): Promise<{ servers: Server[]; nextCursor: string | null }> {
  const queries: string[] = [Query.limit(limit), Query.orderAsc("$createdAt")];
  if (cursorAfter) {
    queries.push(Query.cursorAfter(cursorAfter));
  }
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: SERVERS_COLLECTION_ID,
    queries,
  });
  const items = res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      name: String(d.name),
      $createdAt: String(d.$createdAt ?? ""),
      ownerId: String(d.ownerId),
    } satisfies Server;
  });
  const last = items.at(-1);
  const nextCursor = items.length === limit && last ? last.$id : null;
  return { servers: items, nextCursor };
}

export function createServer(name: string): Promise<Server> {
  return withSession(async ({ userId }) => {
    const ownerId = userId;
    try {
      const permissionStrings = perms.serverOwner(ownerId);
      const permissions = materializePermissions(permissionStrings);
      const serverDoc = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        documentId: ID.unique(),
        data: { name, ownerId },
        permissions,
      });
      const s = serverDoc as unknown as Record<string, unknown>;
      if (MEMBERSHIPS_COLLECTION_ID) {
        try {
          const membershipPerms = materializePermissions(
            perms.serverOwner(ownerId)
          );
          await getDatabases().createDocument({
            databaseId: DATABASE_ID,
            collectionId: MEMBERSHIPS_COLLECTION_ID,
            documentId: ID.unique(),
            data: {
              serverId: String(s.$id),
              userId: ownerId,
              role: "owner",
            },
            permissions: membershipPerms,
          });
        } catch {
          // ignore membership creation failure
        }
      }
      try {
        await createChannel(String(s.$id), "general", ownerId);
      } catch {
        // ignore channel creation failure
      }
      return {
        $id: String(s.$id),
        name: String(s.name),
        $createdAt: String(s.$createdAt ?? ""),
        ownerId: String(s.ownerId),
      } satisfies Server;
    } catch (e) {
      throw normalizeError(e);
    }
  });
}

export async function listChannels(
  serverId: string,
  limit = 100
): Promise<Channel[]> {
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: CHANNELS_COLLECTION_ID,
    queries: [
      Query.equal("serverId", serverId),
      Query.limit(limit),
      Query.orderAsc("$createdAt"),
    ],
  });
  return res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      serverId: String(d.serverId),
      name: String(d.name),
      $createdAt: String(d.$createdAt ?? ""),
    } satisfies Channel;
  });
}

export async function listChannelsPage(
  serverId: string,
  limit = DEFAULT_CHANNEL_PAGE_SIZE,
  cursorAfter?: string
): Promise<{ channels: Channel[]; nextCursor: string | null }> {
  const queries: string[] = [
    Query.equal("serverId", serverId),
    Query.limit(limit),
    Query.orderAsc("$createdAt"),
  ];
  if (cursorAfter) {
    queries.push(Query.cursorAfter(cursorAfter));
  }
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: CHANNELS_COLLECTION_ID,
    queries,
  });
  const items = res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      serverId: String(d.serverId),
      name: String(d.name),
      $createdAt: String(d.$createdAt ?? ""),
    } satisfies Channel;
  });
  const last = items.at(-1);
  const nextCursor = items.length === limit && last ? last.$id : null;
  return { channels: items, nextCursor };
}

export async function createChannel(
  serverId: string,
  name: string,
  ownerId: string
): Promise<Channel> {
  const permissionStrings = perms.serverOwner(ownerId);
  const permissions = materializePermissions(permissionStrings);
  const res = await getDatabases().createDocument({
    databaseId: DATABASE_ID,
    collectionId: CHANNELS_COLLECTION_ID,
    documentId: ID.unique(),
    data: { serverId, name },
    permissions,
  });
  const d = res as unknown as Record<string, unknown>;
  return {
    $id: String(d.$id),
    serverId: String(d.serverId),
    name: String(d.name),
    $createdAt: String(d.$createdAt ?? ""),
  } satisfies Channel;
}

// Membership utilities
export async function listMembershipsForUser(
  userId: string
): Promise<Membership[]> {
  if (!MEMBERSHIPS_COLLECTION_ID) {
    return [];
  }
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: MEMBERSHIPS_COLLECTION_ID,
    queries: [Query.equal("userId", userId), Query.limit(MAX_LIST_LIMIT)],
  });
  return res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      serverId: String(d.serverId),
      userId: String(d.userId),
      role: d.role as "owner" | "member",
      $createdAt: String(d.$createdAt ?? ""),
    } satisfies Membership;
  });
}

export async function joinServer(
  serverId: string,
  userId: string
): Promise<Membership | null> {
  if (!MEMBERSHIPS_COLLECTION_ID) {
    return null;
  }
  const permissionStrings = perms.serverOwner(userId);
  const permissions = materializePermissions(permissionStrings);
  const res = await getDatabases().createDocument({
    databaseId: DATABASE_ID,
    collectionId: MEMBERSHIPS_COLLECTION_ID,
    documentId: ID.unique(),
    data: { serverId, userId, role: "member" },
    permissions,
  });
  const d = res as unknown as Record<string, unknown>;
  return {
    $id: String(d.$id),
    serverId: String(d.serverId),
    userId: String(d.userId),
    role: d.role as "owner" | "member",
    $createdAt: String(d.$createdAt ?? ""),
  } satisfies Membership;
}

export async function deleteChannel(channelId: string) {
  await getDatabases().deleteDocument({
    databaseId: DATABASE_ID,
    collectionId: CHANNELS_COLLECTION_ID,
    documentId: channelId,
  });
}

export async function deleteServer(serverId: string) {
  // Best effort delete channels first
  try {
    const chans = await getDatabases().listDocuments({
      databaseId: DATABASE_ID,
      collectionId: CHANNELS_COLLECTION_ID,
      queries: [Query.equal("serverId", serverId), Query.limit(MAX_LIST_LIMIT)],
    });
    for (const c of chans.documents) {
      const id = String((c as unknown as Record<string, unknown>).$id);

      await deleteChannel(id);
    }
  } catch {
    // ignore
  }
  await getDatabases().deleteDocument({
    databaseId: DATABASE_ID,
    collectionId: SERVERS_COLLECTION_ID,
    documentId: serverId,
  });
}
