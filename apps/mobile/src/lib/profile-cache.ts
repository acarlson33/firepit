import { authHeaders } from "@/lib/firepit/http";

type ProfileData = {
  displayName?: string;
  avatarUrl?: string;
  userName?: string;
  status?: string;
};

type CachedProfile = ProfileData & {
  cachedAt: number;
};

const MAX_CACHE_SIZE = 500;
const MAX_FULL_PROFILE_CACHE_SIZE = 200;
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const cache = new Map<string, CachedProfile>();
const inflight = new Map<string, Promise<Record<string, ProfileData>>>();
const fullProfileCache = new Map<string, { data: Record<string, unknown>; cachedAt: number }>();
const profileInflight = new Map<string, Promise<Record<string, unknown> | null>>();

function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function isExpired(entry: CachedProfile): boolean {
  return Date.now() - entry.cachedAt > CACHE_TTL;
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

export async function getProfilesBatch(
  instanceUrl: string,
  accessToken: string,
  userIds: string[],
): Promise<Record<string, ProfileData>> {
  const uniqueIds = [...new Set(userIds)];
  const uncached: string[] = [];
  const result: Record<string, ProfileData> = {};

  for (const id of uniqueIds) {
    const cached = cache.get(id);
    if (cached && !isExpired(cached)) {
      result[id] = {
        displayName: cached.displayName,
        avatarUrl: cached.avatarUrl,
        userName: cached.userName,
        status: cached.status,
      };
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length === 0) return result;

  const dedupKey = uncached.sort().join(",");
  const inflightPromise = inflight.get(dedupKey);
  if (inflightPromise) {
    const profiles = await inflightPromise;
    Object.assign(result, profiles);
    return result;
  }

  const promise = (async () => {
    try {
      const res = await fetchWithTimeout(`${instanceUrl}/api/profiles/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(accessToken),
        },
        body: JSON.stringify({ userIds: uncached }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          profiles?: Record<string, ProfileData>;
        };
        const profiles = data.profiles ?? {};
        const now = Date.now();
        for (const [id, profile] of Object.entries(profiles)) {
          cache.set(id, { ...profile, cachedAt: now });
          result[id] = profile;
        }
        evictOldest(cache, MAX_CACHE_SIZE);
      }
      return result;
    } catch {
      return result;
    } finally {
      inflight.delete(dedupKey);
    }
  })();

  inflight.set(dedupKey, promise);

  // Guard against stuck promises
  setTimeout(() => { inflight.delete(dedupKey); }, 30_000);

  return promise;
}

export function clearProfileCache(): void {
  cache.clear();
  fullProfileCache.clear();
  inflight.clear();
  profileInflight.clear();
}

export async function getCachedUserProfile(
  instanceUrl: string,
  accessToken: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const cached = fullProfileCache.get(userId);
  if (cached && Date.now() - cached.cachedAt <= CACHE_TTL) {
    return cached.data;
  }

  const inFlight = profileInflight.get(userId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const res = await fetchWithTimeout(
        `${instanceUrl.replace(/\/$/, "")}/api/users/${encodeURIComponent(userId)}/profile`,
        { headers: authHeaders(accessToken) },
      );
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        fullProfileCache.set(userId, { data, cachedAt: Date.now() });
        evictOldest(fullProfileCache, MAX_FULL_PROFILE_CACHE_SIZE);
        return data;
      }
    } catch {
      // ignore fetch failure
    } finally {
      profileInflight.delete(userId);
    }
    return null;
  })();

  profileInflight.set(userId, promise);
  return promise;
}
