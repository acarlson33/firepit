// Centralized Appwrite integration core.
// Provides: environment resolution, browser & server clients, session helpers,
// permission builders, and normalized error types.
// NOTE: Public function signatures used by existing integration files are preserved elsewhere.

import {
    Account,
    Client,
    Databases,
    Permission,
    Role,
    Storage,
    Teams,
} from "appwrite";

// ---------- Error Types ----------
export class AppwriteIntegrationError extends Error {
    cause?: unknown;
    info?: Record<string, unknown>;
    constructor(
        message: string,
        cause?: unknown,
        info?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "AppwriteIntegrationError";
        this.cause = cause;
        this.info = info;
    }
}
export class UnauthorizedError extends AppwriteIntegrationError {
    constructor(
        message = "Unauthorized",
        cause?: unknown,
        info?: Record<string, unknown>,
    ) {
        super(message, cause, info);
        this.name = "UnauthorizedError";
    }
}
export class ForbiddenError extends AppwriteIntegrationError {
    constructor(
        message = "Forbidden",
        cause?: unknown,
        info?: Record<string, unknown>,
    ) {
        super(message, cause, info);
        this.name = "ForbiddenError";
    }
}

// ---------- Environment Resolution ----------
export type EnvConfig = {
    endpoint: string;
    project: string;
    databaseId: string;
    collections: {
        servers: string;
        channels: string;
        categories: string;
        messages: string;
        audit: string;
        memberships: string;
        bannedUsers: string;
        mutedUsers: string;
        friendships: string;
        blocks: string;
        profiles: string;
        conversations: string;
        directMessages: string;
        statuses: string;
        messageAttachments: string;
        pinnedMessages: string;
        featureFlags: string;
        notificationSettings: string;
        inboxItems: string;
        threadReads: string;
        reports: string;
        roles: string;
        polls: string;
        pollVotes: string;
        roleAssignments: string;
        channelPermissionOverrides: string;
        pushTokens: string;
        invites: string;
        inviteUsage: string;
    };
    buckets: {
        avatars: string;
        emojis: string;
        images: string;
        files: string;
        gifs: string;
        stickers: string;
        profileBackgrounds: string;
        avatarFramesPredefined: string;
    };
    teams: {
        adminTeamId: string | null;
        moderatorTeamId: string | null;
    };
};

let cachedEnv: EnvConfig | null = null;

/**
 * Handles first defined.
 *
 * @param {(string | null | undefined)[]} vals - The vals value.
 * @returns {string | undefined} The return value.
 */
function firstDefined(
    ...vals: Array<string | undefined | null>
): string | undefined {
    for (const v of vals) {
        if (v && v.trim() !== "") {
            return v.trim();
        }
    }
    return;
}

type CollectionKey = keyof EnvConfig["collections"];
type BucketKey = keyof EnvConfig["buckets"];

const COLLECTION_DEFS: Array<{
    key: CollectionKey;
    envSuffix: string;
    defaultName: string;
}> = [
    { key: "servers", envSuffix: "SERVERS", defaultName: "servers" },
    { key: "channels", envSuffix: "CHANNELS", defaultName: "channels" },
    { key: "categories", envSuffix: "CATEGORIES", defaultName: "categories" },
    { key: "messages", envSuffix: "MESSAGES", defaultName: "messages" },
    { key: "audit", envSuffix: "AUDIT", defaultName: "audit" },
    { key: "memberships", envSuffix: "MEMBERSHIPS", defaultName: "memberships" },
    { key: "bannedUsers", envSuffix: "BANNED_USERS", defaultName: "banned_users" },
    { key: "mutedUsers", envSuffix: "MUTED_USERS", defaultName: "muted_users" },
    { key: "friendships", envSuffix: "FRIENDSHIPS", defaultName: "friendships" },
    { key: "blocks", envSuffix: "BLOCKS", defaultName: "blocks" },
    { key: "profiles", envSuffix: "PROFILES", defaultName: "profiles" },
    { key: "conversations", envSuffix: "CONVERSATIONS", defaultName: "conversations" },
    { key: "directMessages", envSuffix: "DIRECT_MESSAGES", defaultName: "direct_messages" },
    { key: "statuses", envSuffix: "STATUSES", defaultName: "statuses" },
    { key: "messageAttachments", envSuffix: "MESSAGE_ATTACHMENTS", defaultName: "message_attachments" },
    { key: "pinnedMessages", envSuffix: "PINNED_MESSAGES", defaultName: "pinned_messages" },
    { key: "featureFlags", envSuffix: "FEATURE_FLAGS", defaultName: "feature_flags" },
    { key: "notificationSettings", envSuffix: "NOTIFICATION_SETTINGS", defaultName: "notification_settings" },
    { key: "inboxItems", envSuffix: "INBOX_ITEMS", defaultName: "inbox_items" },
    { key: "threadReads", envSuffix: "THREAD_READS", defaultName: "thread_reads" },
    { key: "reports", envSuffix: "REPORTS", defaultName: "reports" },
    { key: "roles", envSuffix: "ROLES", defaultName: "roles" },
    { key: "polls", envSuffix: "POLLS", defaultName: "polls" },
    { key: "pollVotes", envSuffix: "POLL_VOTES", defaultName: "poll_votes" },
    { key: "roleAssignments", envSuffix: "ROLE_ASSIGNMENTS", defaultName: "role_assignments" },
    { key: "channelPermissionOverrides", envSuffix: "CHANNEL_PERMISSION_OVERRIDES", defaultName: "channel_permission_overrides" },
    { key: "pushTokens", envSuffix: "PUSH_TOKENS", defaultName: "push_tokens" },
    { key: "invites", envSuffix: "INVITES", defaultName: "invites" },
    { key: "inviteUsage", envSuffix: "INVITE_USAGE", defaultName: "invite_usage" },
];

const BUCKET_DEFS: Array<{
    key: BucketKey;
    envSuffix: string;
    defaultName: string;
}> = [
    { key: "avatars", envSuffix: "AVATARS", defaultName: "avatars" },
    { key: "emojis", envSuffix: "EMOJIS", defaultName: "emojis" },
    { key: "images", envSuffix: "IMAGES", defaultName: "images" },
    { key: "files", envSuffix: "FILES", defaultName: "files" },
    { key: "gifs", envSuffix: "GIFS", defaultName: "gifs" },
    { key: "stickers", envSuffix: "STICKERS", defaultName: "stickers" },
    { key: "profileBackgrounds", envSuffix: "PROFILE_BACKGROUNDS", defaultName: "profile-backgrounds" },
    { key: "avatarFramesPredefined", envSuffix: "AVATAR_FRAMES_PREDEFINED", defaultName: "avatar-frames-predefined" },
];

function resolveId(publicVar: string, serverVar: string, defaultName: string): string {
    return firstDefined(
        process.env[publicVar],
        process.env[serverVar],
        defaultName,
    )!;
}

/**
 * Returns env config.
 * @returns {EnvConfig} The return value.
 */
export function getEnvConfig(): EnvConfig {
    if (cachedEnv) {
        return cachedEnv;
    }
    const endpoint = firstDefined(
        process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
        process.env.APPWRITE_ENDPOINT,
    );
    const project = firstDefined(
        process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
        process.env.APPWRITE_PROJECT_ID,
        process.env.APPWRITE_PROJECT,
    );
    if (!endpoint) {
        throw new AppwriteIntegrationError(
            "Appwrite endpoint not configured. Please set NEXT_PUBLIC_APPWRITE_ENDPOINT in your .env.local file. See .env.local.example for reference.",
        );
    }
    if (!project) {
        throw new AppwriteIntegrationError(
            "Appwrite project not configured. Please set NEXT_PUBLIC_APPWRITE_PROJECT_ID in your .env.local file. See .env.local.example for reference.",
        );
    }
    const databaseId = resolveId(
        "NEXT_PUBLIC_APPWRITE_DATABASE_ID",
        "APPWRITE_DATABASE_ID",
        "main",
    );
    const collections = {} as EnvConfig["collections"];
    for (const def of COLLECTION_DEFS) {
        collections[def.key] = resolveId(
            `NEXT_PUBLIC_APPWRITE_${def.envSuffix}_COLLECTION_ID`,
            `APPWRITE_${def.envSuffix}_COLLECTION_ID`,
            def.defaultName,
        );
    }
    const buckets = {} as EnvConfig["buckets"];
    for (const def of BUCKET_DEFS) {
        buckets[def.key] = resolveId(
            `NEXT_PUBLIC_APPWRITE_${def.envSuffix}_BUCKET_ID`,
            `APPWRITE_${def.envSuffix}_BUCKET_ID`,
            def.defaultName,
        );
    }
    const teams = {
        adminTeamId: firstDefined(process.env.APPWRITE_ADMIN_TEAM_ID) || null,
        moderatorTeamId:
            firstDefined(process.env.APPWRITE_MODERATOR_TEAM_ID) || null,
    };
    cachedEnv = { endpoint, project, databaseId, collections, buckets, teams };
    return cachedEnv;
}

/**
 * Handles reset env cache.
 * @returns {void} The return value.
 */
export function resetEnvCache() {
    cachedEnv = null;
}

// ---------- Client Builders ----------
let browserClient: Client | null = null;

/**
 * Returns browser client.
 *
 * @param {boolean} force - The force value, if provided.
 * @returns {Client} The return value.
 */
export function getBrowserClient(force = false): Client {
    const env = getEnvConfig();
    if (!browserClient || force) {
        browserClient = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project);

        // Surface SDK diagnostics in development so realtime/server errors are visible.
        if (process.env.NODE_ENV !== "production") {
            const clientWithLogging = browserClient as Client & {
                setLogLevel?: (
                    level: "debug" | "info" | "warning" | "error" | "none",
                ) => Client;
                // appwrite@20 logs realtime errors to console.debug when logLevel="debug".
            };
            clientWithLogging.setLogLevel?.("debug");
        }
    }
    return browserClient;
}

/**
 * Returns browser account.
 * @returns {Account} The return value.
 */
export function getBrowserAccount(): Account {
    return new Account(getBrowserClient());
}

/**
 * Returns browser databases.
 * @returns {Databases} The return value.
 */
export function getBrowserDatabases(): Databases {
    return new Databases(getBrowserClient());
}

/**
 * Returns browser teams.
 * @returns {Teams} The return value.
 */
export function getBrowserTeams(): Teams {
    return new Teams(getBrowserClient());
}

/**
 * Returns browser storage.
 * @returns {Storage} The return value.
 */
export function getBrowserStorage(): Storage {
    return new Storage(getBrowserClient());
}

// Server client is in appwrite-server.ts (uses node-appwrite SDK).
// Import getServerClient from "./appwrite-server" directly in server-only code.

// ---------- Session Helpers ----------
/**
 * Handles ensure session.
 * @returns {Promise<{ userId: string; } | { error: string; }>} The return value.
 */
export async function ensureSession(): Promise<
    { userId: string } | { error: string }
> {
    try {
        const acc = getBrowserAccount();
        const me = await acc.get();
        return { userId: me.$id };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

/**
 * Handles require session.
 * @returns {Promise<{ userId: string; }>} The return value.
 */
export async function requireSession(): Promise<{ userId: string }> {
    const res = await ensureSession();
    if ("error" in res) {
        throw new UnauthorizedError(res.error);
    }
    return res;
}

// ---------- Permission Helpers ----------
// These use string format for compatibility with both client and server SDKs
export const perms = {
    serverOwner(userId: string) {
        return [
            'read("any")',
            `update("user:${userId}")`,
            `delete("user:${userId}")`,
        ];
    },
    message(
        userId: string,
        teamIds: { mod?: string | null; admin?: string | null },
    ) {
        const base = [
            'read("any")',
            `update("user:${userId}")`,
            `delete("user:${userId}")`,
        ];
        if (teamIds.mod) {
            base.push(
                `update("team:${teamIds.mod}")`,
                `delete("team:${teamIds.mod}")`,
            );
        }
        if (teamIds.admin) {
            base.push(
                `update("team:${teamIds.admin}")`,
                `delete("team:${teamIds.admin}")`,
            );
        }
        return base;
    },
};

// Utility to translate raw SDK errors.
const RE_401 = /401/;
const RE_UNAUTHORIZED = /unauthorized/i;
const RE_403 = /403/;
const RE_FORBIDDEN = /forbidden/i;
/**
 * Normalizes error.
 *
 * @param {unknown} e - The e value.
 * @returns {Error} The return value.
 */
export function normalizeError(e: unknown): Error {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
        return e;
    }
    const msg = (e as Error)?.message || String(e);
    if (RE_401.test(msg) || RE_UNAUTHORIZED.test(msg)) {
        return new UnauthorizedError(msg, e);
    }
    if (RE_403.test(msg) || RE_FORBIDDEN.test(msg)) {
        return new ForbiddenError(msg, e);
    }
    return e instanceof Error ? e : new AppwriteIntegrationError(msg, e);
}

// Simple retry wrapper for transient failures (network hiccups)
export async function withRetry<T>(
    fn: () => Promise<T>,
    attempts = 2,
): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (i === attempts - 1) {
                break;
            }
            // brief async delay (no setTimeout to avoid timers in SSR) – microtask boundary

            await Promise.resolve();
        }
    }
    throw normalizeError(lastErr);
}

// Wrapper enforcing session and translating errors
export async function withSession<T>(
    fn: (ctx: { userId: string }) => Promise<T>,
): Promise<T> {
    const { userId } = await requireSession();
    try {
        return await fn({ userId });
    } catch (e) {
        throw normalizeError(e);
    }
}

// Helper mapping old permission builder objects to Appwrite Permission class usage.
// We retain string forms internally for testability; conversion is done where needed.
const ROLE_PREFIX_USER = "user:";
const ROLE_PREFIX_TEAM = "team:";
const SLICE_OFFSET = 5; // shared prefix length
const PERM_REGEX = /^(\w+)\("([^"]+)"\)$/;
/**
 * Handles materialize permissions.
 *
 * @param {string[]} list - The list value.
 * @returns {string[]} The return value.
 */
export function materializePermissions(list: string[]) {
    /**
     * Handles target to role.
     *
     * @param {string} target - The target value.
     * @returns {string | null} The return value.
     */
    function targetToRole(target: string) {
        if (target === "any") {
            return Role.any();
        }
        if (target.startsWith(ROLE_PREFIX_USER)) {
            return Role.user(target.slice(SLICE_OFFSET));
        }
        if (target.startsWith(ROLE_PREFIX_TEAM)) {
            return Role.team(target.slice(SLICE_OFFSET));
        }
        return null;
    }
    /**
     * Builds build.
     *
     * @param {string} op - The op value.
     * @param {string} target - The target value.
     * @returns {string | null} The return value.
     */
    function build(op: string, target: string) {
        const role = targetToRole(target);
        if (!role) {
            return null;
        }
        switch (op) {
            case "read":
                return Permission.read(role);
            case "update":
                return Permission.update(role);
            case "delete":
                return Permission.delete(role);
            case "write":
                return Permission.write(role);
            default:
                return null;
        }
    }
    return list.map((p) => {
        const match = p.match(PERM_REGEX);
        if (!match) {
            return p;
        }
        const perm = build(match[1], match[2]);
        return perm || p;
    });
}
