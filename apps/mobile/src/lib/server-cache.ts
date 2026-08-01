import { fetchChannels, fetchServerCategories, fetchServer, fetchMyServers, fetchEffectivePermissions } from "@/lib/firepit/servers";
import { fetchDirectMessageConversations } from "@/lib/firepit/messages";
import { getProfilesBatch } from "@/lib/profile-cache";
import type { Channel, DirectMessageConversation, EffectivePermissions, Server, ServerCategory } from "@/lib/firepit/types";

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

const CACHE_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

const channelsCache = new Map<string, CacheEntry<Channel[]>>();
const categoriesCache = new Map<string, CacheEntry<ServerCategory[]>>();
const serverNamesCache = new Map<string, CacheEntry<string>>();
const serversCache = new Map<string, CacheEntry<Server[]>>();
const conversationsCache = new Map<string, CacheEntry<DirectMessageConversation[]>>();

function isValid(entry: CacheEntry<unknown>, ttl = CACHE_TTL): boolean {
  return Date.now() - entry.cachedAt < ttl;
}

function evictOldest(map: Map<string, unknown>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const iter = map.keys();
  while (map.size > maxSize) {
    const { value, done } = iter.next();
    if (done) break;
    map.delete(value);
  }
}

export async function getChannels(
  baseUrl: string,
  token: string,
  serverId: string,
): Promise<Channel[]> {
  const cached = channelsCache.get(serverId);
  if (cached && isValid(cached)) return cached.data;

  const res = await fetchChannels(baseUrl, token, serverId);
  const channels = res.channels ?? [];
  channelsCache.set(serverId, { data: channels, cachedAt: Date.now() });
  evictOldest(channelsCache, MAX_ENTRIES);
  return channels;
}

export async function getCategories(
  baseUrl: string,
  token: string,
  serverId: string,
): Promise<ServerCategory[]> {
  const cached = categoriesCache.get(serverId);
  if (cached && isValid(cached)) return cached.data;

  const res = await fetchServerCategories(baseUrl, token, serverId);
  const categories = res.categories ?? [];
  categoriesCache.set(serverId, { data: categories, cachedAt: Date.now() });
  evictOldest(categoriesCache, MAX_ENTRIES);
  return categories;
}

export async function getServerName(
  baseUrl: string,
  token: string,
  serverId: string,
): Promise<string | null> {
  const cached = serverNamesCache.get(serverId);
  if (cached && isValid(cached)) return cached.data;

  const res = await fetchServer(baseUrl, token, serverId);
  const name = res.server?.name ?? null;
  if (name) {
    serverNamesCache.set(serverId, { data: name, cachedAt: Date.now() });
    evictOldest(serverNamesCache, MAX_ENTRIES);
  }
  return name;
}

export function invalidateServerCache(serverId: string): void {
  channelsCache.delete(serverId);
  categoriesCache.delete(serverId);
  serverNamesCache.delete(serverId);
}

const CONVERSATIONS_CACHE_KEY = "__all__";

export async function getServers(
  baseUrl: string,
  token: string,
): Promise<Server[]> {
  const cached = serversCache.get(CONVERSATIONS_CACHE_KEY);
  if (cached && isValid(cached)) return cached.data;

  const res = await fetchMyServers(baseUrl, token);
  const servers = (res.servers ?? []).filter(
    (s): s is Server & { $id: string } => typeof s.$id === "string" && s.$id.length > 0,
  );
  serversCache.set(CONVERSATIONS_CACHE_KEY, { data: servers, cachedAt: Date.now() });
  evictOldest(serversCache, MAX_ENTRIES);
  return servers;
}

export async function getConversations(
  baseUrl: string,
  token: string,
): Promise<DirectMessageConversation[]> {
  const cached = conversationsCache.get(CONVERSATIONS_CACHE_KEY);
  if (cached && isValid(cached)) return cached.data;

  const res = await fetchDirectMessageConversations(baseUrl, token);
  const conversations = (res.conversations ?? []).filter(
    (c): c is DirectMessageConversation & { $id: string } => typeof c.$id === "string" && c.$id.length > 0,
  );
  conversationsCache.set(CONVERSATIONS_CACHE_KEY, { data: conversations, cachedAt: Date.now() });
  evictOldest(conversationsCache, MAX_ENTRIES);
  return conversations;
}

export async function enrichConversations(
  baseUrl: string,
  token: string,
  conversations: DirectMessageConversation[],
  currentUserId: string,
): Promise<DirectMessageConversation[]> {
  const otherIds = new Set<string>();
  for (const conv of conversations) {
    if (!conv.isGroup && conv.participants) {
      for (const id of conv.participants) {
        if (id.length > 0 && id !== currentUserId) otherIds.add(id);
      }
    }
  }
  if (otherIds.size === 0) return conversations;

  try {
    const profileMap = await getProfilesBatch(baseUrl, token, Array.from(otherIds));
    return conversations.map((conv) => {
      if (conv.isGroup) return conv;
      const otherId = conv.participants?.find((id) => id.length > 0 && id !== currentUserId);
      if (otherId && profileMap[otherId]) {
        return {
          ...conv,
          otherUser: {
            userId: otherId,
            displayName: profileMap[otherId].displayName,
            avatarUrl: profileMap[otherId].avatarUrl,
          },
        } as DirectMessageConversation;
      }
      return conv;
    });
  } catch {
    return conversations;
  }
}

export function invalidateConversationsCache(): void {
  conversationsCache.delete(CONVERSATIONS_CACHE_KEY);
}

export function invalidateServersCache(): void {
  serversCache.delete(CONVERSATIONS_CACHE_KEY);
}

const PERMISSIONS_CACHE_TTL = 60_000;
const permissionsCache = new Map<string, CacheEntry<EffectivePermissions>>();

export async function getCachedEffectivePermissions(
  baseUrl: string,
  token: string,
  serverId: string,
  channelId: string,
  userId: string,
) {
  const key = `${serverId}:${channelId}:${userId}`;
  const cached = permissionsCache.get(key);
  if (cached && isValid(cached, PERMISSIONS_CACHE_TTL)) return cached.data;

  const res = await fetchEffectivePermissions(baseUrl, token, serverId, channelId, userId);
  permissionsCache.set(key, { data: res, cachedAt: Date.now() });
  evictOldest(permissionsCache, MAX_ENTRIES);
  return res;
}

export function invalidatePermissionsCache(serverId?: string): void {
  if (!serverId) {
    permissionsCache.clear();
    return;
  }
  for (const key of permissionsCache.keys()) {
    if (key.startsWith(`${serverId}:`)) {
      permissionsCache.delete(key);
    }
  }
}
