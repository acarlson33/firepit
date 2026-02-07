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
        messages: string;
        audit: string;
        typing: string | null;
        memberships: string | null;
        profiles: string;
        conversations: string;
        directMessages: string;
        statuses: string | null;
        messageAttachments: string;
        featureFlags: string;
        notificationSettings: string;
    };
    buckets: {
        avatars: string;
        emojis: string;
        images: string;
        files: string;
    };
    teams: {
        adminTeamId: string | null;
        moderatorTeamId: string | null;
    };
};

let cachedEnv: EnvConfig | null = null;

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
    console.log("Appwrite Endpoint:", endpoint);
    console.log("Appwrite Project ID:", project);
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
    const databaseId =
        firstDefined(
            process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID,
            process.env.APPWRITE_DATABASE_ID,
            "main",
        ) || "main";
    const collections = {
        servers:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_SERVERS_COLLECTION_ID,
                process.env.APPWRITE_SERVERS_COLLECTION_ID,
                "servers",
            ) || "servers",
        channels:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_CHANNELS_COLLECTION_ID,
                process.env.APPWRITE_CHANNELS_COLLECTION_ID,
                "channels",
            ) || "channels",
        messages:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID,
                process.env.APPWRITE_MESSAGES_COLLECTION_ID,
                "messages",
            ) || "messages",
        audit:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_AUDIT_COLLECTION_ID,
                process.env.APPWRITE_AUDIT_COLLECTION_ID,
                "audit",
            ) || "audit",
        typing:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_TYPING_COLLECTION_ID,
                process.env.APPWRITE_TYPING_COLLECTION_ID,
            ) || null,
        memberships:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID,
                process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
            ) || null,
        profiles:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID,
                process.env.APPWRITE_PROFILES_COLLECTION_ID,
                "profiles",
            ) || "profiles",
        conversations:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_CONVERSATIONS_COLLECTION_ID,
                process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID,
                "conversations",
            ) || "conversations",
        directMessages:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_DIRECT_MESSAGES_COLLECTION_ID,
                process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID,
                "direct_messages",
            ) || "direct_messages",
        statuses:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_STATUSES_COLLECTION_ID,
                process.env.APPWRITE_STATUSES_COLLECTION_ID,
            ) || null,
        messageAttachments:
            firstDefined(
                process.env
                    .NEXT_PUBLIC_APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID,
                process.env.APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID,
                "message_attachments",
            ) || "message_attachments",
        featureFlags:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_FEATURE_FLAGS_COLLECTION_ID,
                process.env.APPWRITE_FEATURE_FLAGS_COLLECTION_ID,
                "feature_flags",
            ) || "feature_flags",
        notificationSettings:
            firstDefined(
                process.env
                    .NEXT_PUBLIC_APPWRITE_NOTIFICATION_SETTINGS_COLLECTION_ID,
                process.env.APPWRITE_NOTIFICATION_SETTINGS_COLLECTION_ID,
                "notification_settings",
            ) || "notification_settings",
    };
    const buckets = {
        avatars:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_AVATARS_BUCKET_ID,
                process.env.APPWRITE_AVATARS_BUCKET_ID,
                "avatars",
            ) || "avatars",
        emojis:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_EMOJIS_BUCKET_ID,
                process.env.APPWRITE_EMOJIS_BUCKET_ID,
                "emojis",
            ) || "emojis",
        images:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_IMAGES_BUCKET_ID,
                process.env.APPWRITE_IMAGES_BUCKET_ID,
                "images",
            ) || "images",
        files:
            firstDefined(
                process.env.NEXT_PUBLIC_APPWRITE_FILES_BUCKET_ID,
                process.env.APPWRITE_FILES_BUCKET_ID,
                "files",
            ) || "files",
    };
    const teams = {
        adminTeamId: firstDefined(process.env.APPWRITE_ADMIN_TEAM_ID) || null,
        moderatorTeamId:
            firstDefined(process.env.APPWRITE_MODERATOR_TEAM_ID) || null,
    };
    cachedEnv = { endpoint, project, databaseId, collections, buckets, teams };
    return cachedEnv;
}

export function resetEnvCache() {
    cachedEnv = null;
}

// ---------- Client Builders ----------
let browserClient: Client | null = null;

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

export function getBrowserAccount(): Account {
    return new Account(getBrowserClient());
}

export function getBrowserDatabases(): Databases {
    return new Databases(getBrowserClient());
}

export function getBrowserTeams(): Teams {
    return new Teams(getBrowserClient());
}

export function getBrowserStorage(): Storage {
    return new Storage(getBrowserClient());
}

// Server client moved to appwrite-server.ts to use node-appwrite SDK
// Re-export for backward compatibility
export { getServerClient } from "./appwrite-server";

// ---------- Session Helpers ----------
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
export function materializePermissions(list: string[]) {
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
