import type { Teams } from "appwrite";
import { Query } from "appwrite";

import {
  getBrowserTeams,
  getEnvConfig,
  getServerClient,
} from "./appwrite-core";

export type RoleTag = { id: string; label: string; color?: string };
export type RoleInfo = { isAdmin: boolean; isModerator: boolean };
export type ExtendedRoleInfo = RoleInfo & { tags: RoleTag[] };

// Centralized environment config
const env = getEnvConfig();
const adminTeamId = env.teams.adminTeamId || undefined;
const moderatorTeamId = env.teams.moderatorTeamId || undefined;

// Optional explicit user ID overrides (comma separated) – useful for bootstrap/dev.
const adminUserOverrides = (process.env.APPWRITE_ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const moderatorUserOverrides = (process.env.APPWRITE_MODERATOR_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Robust membership check with pagination; avoids false negatives for large teams.
async function isMember(
  teamId: string,
  userId: string,
  teams: Teams
): Promise<boolean> {
  // Quick guard
  if (!teamId) {
    return false;
  }
  let offset = 0;
  const limit = 50; // Reasonable page size
  // Safety cap to prevent runaway loops even if API misbehaves.
  const maxPages = 10;
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const res = await teams.listMemberships(teamId, [
        Query.limit(limit),
        Query.offset(offset),
      ]);
      const list = res.memberships || [];
      if (
        list.some(
          (m) => (m as unknown as { userId?: string }).userId === userId
        )
      ) {
        return true;
      }
      // Done if we fetched all reported memberships.
      const fetched = offset + list.length;
      if (res.total <= fetched || list.length === 0) {
        return false;
      }
      offset += list.length;
    } catch {
      // Treat any API failure as non-membership (silent soft-fail)
      return false;
    }
  }
  return false;
}

function selectTeamsClient(): Teams {
  // Prefer server client (API key) if available for reliable membership listing; otherwise fall back to browser teams.
  if (process.env.APPWRITE_API_KEY) {
    try {
      return getServerClient().teams;
    } catch {
      // fallback below
    }
  }
  return getBrowserTeams();
}

export async function getUserRoles(userId: string | null): Promise<RoleInfo> {
  if (!userId) {
    return { isAdmin: false, isModerator: false };
  }
  // Explicit overrides take precedence (useful before teams exist)
  const overrideAdmin = adminUserOverrides.includes(userId);
  const overrideModerator =
    overrideAdmin || moderatorUserOverrides.includes(userId);

  const teams = selectTeamsClient();

  let isAdmin = overrideAdmin;
  let isModerator = overrideModerator;

  // Only hit API if not already satisfied by override.
  if (!isAdmin && adminTeamId) {
    isAdmin = await isMember(adminTeamId, userId, teams);
  }
  if (!isModerator && moderatorTeamId) {
    isModerator = await isMember(moderatorTeamId, userId, teams);
  }
  if (isAdmin) {
    isModerator = true; // implicit privilege elevation
  }
  return { isAdmin, isModerator };
}

let parsedTeamMap: Record<string, { label: string; color?: string }> | null =
  null;
function loadTeamMap() {
  if (parsedTeamMap) {
    return parsedTeamMap;
  }
  try {
    const raw = process.env.NEXT_PUBLIC_ROLE_TEAM_MAP;
    if (raw) {
      parsedTeamMap = JSON.parse(raw) as Record<
        string,
        { label: string; color?: string }
      >;
    } else {
      parsedTeamMap = {};
    }
  } catch {
    parsedTeamMap = {};
  }
  return parsedTeamMap;
}

// Internal cache accessors to keep complexity low.
type CacheEntry = { expires: number; value: ExtendedRoleInfo };
function getRoleTagCache(): Map<string, CacheEntry> {
  const g = globalThis as unknown as {
    __roleTagCache?: Map<string, CacheEntry>;
  };
  if (!g.__roleTagCache) {
    g.__roleTagCache = new Map();
  }
  return g.__roleTagCache;
}

function cacheHit(userId: string, now: number): ExtendedRoleInfo | null {
  const c = getRoleTagCache();
  const entry = c.get(userId);
  if (entry && entry.expires > now) {
    return entry.value;
  }
  return null;
}

function cacheStore(
  userId: string,
  value: ExtendedRoleInfo,
  now: number,
  ttl: number
) {
  getRoleTagCache().set(userId, { expires: now + ttl, value });
}

async function fetchCustomTeamTags(
  userId: string,
  teams: Teams,
  teamMap: Record<string, { label: string; color?: string }>
): Promise<RoleTag[]> {
  const tags: RoleTag[] = [];
  const entries = Object.entries(teamMap);
  for (const [teamId, cfg] of entries) {
    try {
      const res = await teams.listMemberships(teamId);
      const match = res.memberships.some(
        (m) => (m as unknown as { userId?: string }).userId === userId
      );
      if (match) {
        tags.push({ id: teamId, label: cfg.label, color: cfg.color });
      }
    } catch {
      // ignore individual team failures
    }
  }
  return tags;
}

function appendImplicitTags(base: RoleInfo, tags: RoleTag[]): RoleTag[] {
  const lowered = tags.map((t) => t.label.toLowerCase());
  if (base.isAdmin && !lowered.includes("admin")) {
    tags.push({ id: "__admin", label: "Admin", color: "bg-red-600" });
  }
  if (base.isModerator && !lowered.includes("mod")) {
    tags.push({ id: "__mod", label: "Mod", color: "bg-amber-600" });
  }
  return tags;
}

const ROLE_TAG_CACHE_TTL_MS = 60_000; // 60s

export async function getUserRoleTags(
  userId: string | null
): Promise<ExtendedRoleInfo> {
  const base = await getUserRoles(userId);
  if (!userId) {
    return { ...base, tags: [] };
  }
  // Teams client can still operate even if server key missing; tags will just be empty on failures.
  const now = Date.now();
  const hit = cacheHit(userId, now);
  if (hit) {
    return hit;
  }
  const teamMap = loadTeamMap();
  const teams = selectTeamsClient();
  const customTags = await fetchCustomTeamTags(userId, teams, teamMap);
  const allTags = appendImplicitTags(base, customTags);
  const value: ExtendedRoleInfo = { ...base, tags: allTags };
  cacheStore(userId, value, now, ROLE_TAG_CACHE_TTL_MS);
  return value;
}
