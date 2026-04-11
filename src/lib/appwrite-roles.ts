import type { Teams } from "appwrite";
import { Query } from "appwrite";
import type { Teams as ServerTeams } from "node-appwrite";

import { getBrowserTeams, getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";

export type RoleTag = { id: string; label: string; color?: string };
export type RoleInfo = { isAdmin: boolean; isModerator: boolean };
export type ExtendedRoleInfo = RoleInfo & { tags: RoleTag[] };

// Centralized environment config
const env = getEnvConfig();
const adminTeamId = env.teams.adminTeamId || undefined;
const moderatorTeamId = env.teams.moderatorTeamId || undefined;

// Optional explicit user ID overrides (comma separated) – useful for bootstrap/dev.
// Parse these at call time so tests can override them
/**
 * Returns admin user overrides.
 * @returns {string[]} The return value.
 */
function getAdminUserOverrides(): string[] {
    return (process.env.APPWRITE_ADMIN_USER_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Returns moderator user overrides.
 * @returns {string[]} The return value.
 */
function getModeratorUserOverrides(): string[] {
    return (process.env.APPWRITE_MODERATOR_USER_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function getMembershipUserId(membership: unknown): string | undefined {
    if (!membership || typeof membership !== "object") {
        return undefined;
    }

    const candidate = membership as { userId?: unknown };
    return typeof candidate.userId === "string" ? candidate.userId : undefined;
}

// Robust membership check with pagination; avoids false negatives for large teams.
/**
 * Determines whether is member.
 *
 * @param {string} teamId - The team id value.
 * @param {string} userId - The user id value.
 * @param {import("/home/august/code/firepit/node_modules/.bun/appwrite@20.1.0/node_modules/appwrite/types/services/teams").Teams | import("/home/august/code/firepit/node_modules/.bun/node-appwrite@20.3.0/node_modules/node-appwrite/dist/services/teams").Teams} teams - The teams value.
 * @returns {Promise<boolean>} The return value.
 */
async function isMember(
    teamId: string,
    userId: string,
    teams: Teams | ServerTeams,
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
                    (membership) => getMembershipUserId(membership) === userId,
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

/**
 * Handles select teams client.
 * @returns {import("/home/august/code/firepit/node_modules/.bun/appwrite@20.1.0/node_modules/appwrite/types/services/teams").Teams | import("/home/august/code/firepit/node_modules/.bun/node-appwrite@20.3.0/node_modules/node-appwrite/dist/services/teams").Teams} The return value.
 */
function selectTeamsClient(): Teams | ServerTeams {
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

/**
 * Returns user roles.
 *
 * @param {string | null} userId - The user id value.
 * @returns {Promise<RoleInfo>} The return value.
 */
export async function getUserRoles(userId: string | null): Promise<RoleInfo> {
    if (!userId) {
        return { isAdmin: false, isModerator: false };
    }
    // Explicit overrides take precedence (useful before teams exist)
    const adminUserOverrides = getAdminUserOverrides();
    const moderatorUserOverrides = getModeratorUserOverrides();
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
let lastTeamMapRaw: string | undefined = undefined;

/**
 * Handles load team map.
 * @returns {{ [x: string]: { label: string; color?: string | undefined; }; }} The return value.
 */
function loadTeamMap() {
    const raw = process.env.ROLE_TEAM_MAP;

    // Re-parse if environment changed or first time
    if (parsedTeamMap !== null && raw === lastTeamMapRaw) {
        return parsedTeamMap;
    }

    lastTeamMapRaw = raw;

    try {
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
/**
 * Returns role tag cache.
 * @returns {Map<string, CacheEntry>} The return value.
 */
function getRoleTagCache(): Map<string, CacheEntry> {
    const g = globalThis as unknown as {
        __roleTagCache?: Map<string, CacheEntry>;
    };
    if (!g.__roleTagCache) {
        g.__roleTagCache = new Map();
    }
    return g.__roleTagCache;
}

/**
 * Handles cache hit.
 *
 * @param {string} userId - The user id value.
 * @param {number} now - The now value.
 * @returns {ExtendedRoleInfo | null} The return value.
 */
function cacheHit(userId: string, now: number): ExtendedRoleInfo | null {
    const c = getRoleTagCache();
    const entry = c.get(userId);
    if (entry && entry.expires > now) {
        return entry.value;
    }
    return null;
}

/**
 * Handles cache store.
 *
 * @param {string} userId - The user id value.
 * @param {RoleInfo & { tags: RoleTag[]; }} value - The value value.
 * @param {number} now - The now value.
 * @param {number} ttl - The ttl value.
 * @returns {void} The return value.
 */
function cacheStore(
    userId: string,
    value: ExtendedRoleInfo,
    now: number,
    ttl: number,
) {
    getRoleTagCache().set(userId, { expires: now + ttl, value });
}

/**
 * Handles fetch custom team tags.
 *
 * @param {string} userId - The user id value.
 * @param {import("/home/august/code/firepit/node_modules/.bun/appwrite@20.1.0/node_modules/appwrite/types/services/teams").Teams | import("/home/august/code/firepit/node_modules/.bun/node-appwrite@20.3.0/node_modules/node-appwrite/dist/services/teams").Teams} teams - The teams value.
 * @param {{ [x: string]: { label: string; color?: string | undefined; }; }} teamMap - The team map value.
 * @returns {Promise<RoleTag[]>} The return value.
 */
async function fetchCustomTeamTags(
    userId: string,
    teams: Teams | ServerTeams,
    teamMap: Record<string, { label: string; color?: string }>,
): Promise<RoleTag[]> {
    const tags: RoleTag[] = [];
    const entries = Object.entries(teamMap);
    for (const [teamId, cfg] of entries) {
        try {
            const match = await isMember(teamId, userId, teams);
            if (match) {
                tags.push({ id: teamId, label: cfg.label, color: cfg.color });
            }
        } catch {
            // ignore individual team failures
        }
    }
    return tags;
}

/**
 * Handles append implicit tags.
 *
 * @param {{ isAdmin: boolean; isModerator: boolean; }} base - The base value.
 * @param {RoleTag[]} tags - The tags value.
 * @returns {RoleTag[]} The return value.
 */
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

/**
 * Returns user role tags.
 *
 * @param {string | null} userId - The user id value.
 * @returns {Promise<ExtendedRoleInfo>} The return value.
 */
export async function getUserRoleTags(
    userId: string | null,
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
