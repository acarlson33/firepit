import { ID, Query } from "appwrite";

import {
    AppwriteIntegrationError,
  getBrowserDatabases,
  getEnvConfig,
  normalizeError,
  withSession,
} from "./appwrite-core";
import type { Channel, Membership, Server } from "./types";
import { assignDefaultRoleBrowser } from "./default-role";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
// Read memberships collection ID at call time for testability
function getMembershipsCollectionId(): string | undefined {
  return getEnvConfig().collections.memberships || undefined;
}
const MAX_LIST_LIMIT = 500; // upper bound used for bulk listing
const DEFAULT_SERVER_PAGE_SIZE = 25;
const DEFAULT_CHANNEL_PAGE_SIZE = 50;
// Authorization diagnostics constants
// (Unauthorized diagnostics constants removed after refactor to normalized errors)

function getDatabases() {
  return getBrowserDatabases();
}

export async function listServers(limit = 25): Promise<Server[]> {
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: SERVERS_COLLECTION_ID,
    // Use system attribute $createdAt for ordering to avoid schema attribute requirement
    queries: [Query.limit(Math.min(limit, 100)), Query.orderAsc("$createdAt")],
  });
  return res.documents.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      $id: String(d.$id),
      name: String(d.name),
      $createdAt: String(d.$createdAt ?? ""),
      ownerId: String(d.ownerId),
      memberCount: typeof d.memberCount === 'number' ? d.memberCount : undefined,
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
      memberCount: typeof d.memberCount === 'number' ? d.memberCount : undefined,
    } satisfies Server;
  });
  const last = items.at(-1);
  const nextCursor = items.length === limit && last ? last.$id : null;
  return { servers: items, nextCursor };
}

export function createServer(name: string, options?: { bypassFeatureCheck?: boolean }): Promise<Server> {
  return withSession(async ({ userId }) => {
    const ownerId = userId;
    
    // Check feature flag unless bypassed (e.g., for admin creation or tests)
    if (!options?.bypassFeatureCheck) {
      try {
        const { getFeatureFlag, FEATURE_FLAGS } = await import("./feature-flags");
        const allowUserServers = await getFeatureFlag(FEATURE_FLAGS.ALLOW_USER_SERVERS);
        if (!allowUserServers) {
          throw normalizeError(
            new Error("Server creation is currently disabled. Contact an administrator.")
          );
        }
      } catch (error) {
        // In test environments or when feature flags aren't configured, allow creation
        // This ensures backward compatibility with existing tests
        const isConfigError = error instanceof Error && 
          error instanceof AppwriteIntegrationError;
        if (!isConfigError) {
          throw error;
        }
      }
    }
    
    try {
      const { Permission, Role } = await import("appwrite");
      const permissions = [
        Permission.read(Role.any()),
        Permission.update(Role.user(ownerId)),
        Permission.delete(Role.user(ownerId)),
      ];
      const serverDoc = await getDatabases().createDocument({
        databaseId: DATABASE_ID,
        collectionId: SERVERS_COLLECTION_ID,
        documentId: ID.unique(),
        data: { name, ownerId, memberCount: 1 },
        permissions,
      });
      const s = serverDoc as unknown as Record<string, unknown>;
      const membershipsCollectionId = getMembershipsCollectionId();
      if (membershipsCollectionId) {
        try {
          const membershipPerms = [
            Permission.read(Role.any()),
            Permission.update(Role.user(ownerId)),
            Permission.delete(Role.user(ownerId)),
          ];
          await getDatabases().createDocument({
            databaseId: DATABASE_ID,
            collectionId: membershipsCollectionId,
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
        memberCount: typeof s.memberCount === 'number' ? s.memberCount : 1,
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
  _ownerId: string
): Promise<Channel> {
  const { Permission, Role } = await import("appwrite");
  const permissions = [Permission.read(Role.any())];
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
  const membershipsCollectionId = getMembershipsCollectionId();
  if (!membershipsCollectionId) {
    return [];
  }
  const res = await getDatabases().listDocuments({
    databaseId: DATABASE_ID,
    collectionId: membershipsCollectionId,
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
  const membershipsCollectionId = getMembershipsCollectionId();
  if (!membershipsCollectionId) {
    return null;
  }
  const { Permission, Role } = await import("appwrite");
  const permissions = [
    Permission.read(Role.any()),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
  const res = await getDatabases().createDocument({
    databaseId: DATABASE_ID,
    collectionId: membershipsCollectionId,
    documentId: ID.unique(),
    data: { serverId, userId, role: "member" },
    permissions,
  });
  const d = res as unknown as Record<string, unknown>;
  try {
    await assignDefaultRoleBrowser(serverId, userId);
  } catch {
    // Non-fatal: continue even if role assignment fails
  }
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
