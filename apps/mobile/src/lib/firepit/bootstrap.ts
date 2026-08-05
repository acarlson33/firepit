import { Account, Client } from "react-native-appwrite";

import { authHeaders, firepitRequest, FirepitHttpError } from "@/lib/firepit/http";
import {
    type CompatibilityEvaluation,
    type CurrentUser,
    type FeatureFlagState,
    type InstanceMetadata,
    type VersionInfo,
} from "@/lib/firepit/types";

const MOBILE_MINIMUM_SERVER_VERSION = "1.9.0";
export type AppwriteConfig = {
    endpoint: string;
    project: string;
};

const VERSION_FIELD_KEYS = [
    "version",
    "serverVersion",
    "apiVersion",
    "contractVersion",
    "releaseVersion",
    "buildVersion",
    "appVersion",
] as const;

function parseSemver(value?: string | null) {
    if (typeof value !== "string") {
        return null;
    }

    const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) {
        return null;
    }
    return match.slice(1).map((segment) => Number.parseInt(segment, 10));
}

function compareSemver(left: string, right: string) {
    const leftVersion = parseSemver(left);
    const rightVersion = parseSemver(right);
    if (!leftVersion || !rightVersion) {
        return null;
    }
    for (let index = 0; index < 3; index += 1) {
        if (leftVersion[index] > rightVersion[index]) {
            return 1;
        }
        if (leftVersion[index] < rightVersion[index]) {
            return -1;
        }
    }
    return 0;
}

function extractVersionString(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    if (!value || typeof value !== "object") {
        return null;
    }

    for (const key of VERSION_FIELD_KEYS) {
        const candidate = (value as Record<string, unknown>)[key];
        if (typeof candidate === "string") {
            const trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        const nestedVersion = extractVersionString(candidate);
        if (nestedVersion) {
            return nestedVersion;
        }
    }

    return null;
}

function normalizeVersionInfo(payload: unknown): VersionInfo {
    if (typeof payload === "string") {
        return { version: payload.trim() };
    }

    if (!payload || typeof payload !== "object") {
        return { version: "" };
    }

    const version = extractVersionString(payload) ?? "";
    return {
        ...(payload as Record<string, unknown>),
        version,
    } as VersionInfo;
}

function createAppwriteClient(config: AppwriteConfig) {
    return new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.project)
        .setPlatform("com.acarlson33.firepit");
}

function normalizeCurrentUser(user: unknown): CurrentUser | null {
    if (!user || typeof user !== "object") {
        return null;
    }

    const candidate = user as Record<string, unknown>;
    const userId =
        typeof candidate.$id === "string"
            ? candidate.$id
            : typeof candidate.userId === "string"
              ? candidate.userId
              : undefined;
    const name =
        typeof candidate.name === "string" ? candidate.name : undefined;
    const displayName =
        typeof candidate.displayName === "string"
            ? candidate.displayName
            : name;
    const userName =
        typeof candidate.userName === "string" ? candidate.userName : name;

    return {
        $id: userId,
        userId,
        name,
        email:
            typeof candidate.email === "string" ? candidate.email : undefined,
        displayName,
        userName,
        avatarUrl:
            typeof candidate.avatarUrl === "string"
                ? candidate.avatarUrl
                : undefined,
        roles:
            typeof candidate.roles === "object" && candidate.roles !== null
                ? (candidate.roles as Record<string, unknown>)
                : undefined,
    };
}

export function extractAppwriteConfig(
    instance: InstanceMetadata,
): AppwriteConfig | null {
    const endpoint = normalizeInstanceUrl(instance.appwriteEndpoint);
    const project =
        (typeof instance.appwriteProjectId === "string" &&
            instance.appwriteProjectId.trim()) ||
        // appwriteProject is the legacy alias used by older instances
        (typeof instance["appwriteProject"] === "string" &&
            instance["appwriteProject"].trim()) ||
        "";

    if (!endpoint || !project) {
        return null;
    }

    return { endpoint, project };
}

function selectMinimumVersion(instance: InstanceMetadata) {
    return (
        (typeof instance.minimumMobileVersion === "string" &&
            instance.minimumMobileVersion) ||
        (typeof instance.minMobileVersion === "string" &&
            instance.minMobileVersion) ||
        (typeof instance.minimumClientVersion === "string" &&
            instance.minimumClientVersion) ||
        (typeof instance.minClientVersion === "string" &&
            instance.minClientVersion) ||
        MOBILE_MINIMUM_SERVER_VERSION
    );
}

export function evaluateCompatibility(
    version: VersionInfo,
    instance: InstanceMetadata,
): CompatibilityEvaluation {
    const serverVersion = extractVersionString(version) ?? "";
    const minimumVersion = selectMinimumVersion(instance);
    const comparison = compareSemver(serverVersion, minimumVersion);

    if (instance.compatible === false) {
        return {
            compatible: false,
            minimumVersion,
            reason:
                instance.compatibilityReason ||
                "Instance reports itself as incompatible with mobile.",
        };
    }

    if (comparison === null) {
        return {
            compatible: false,
            minimumVersion,
            reason: `Unable to compare server version ${
                serverVersion || "unknown"
            } against mobile minimum ${minimumVersion}.`,
        };
    }

    if (comparison < 0) {
        return {
            compatible: false,
            minimumVersion,
            reason: `Server version ${serverVersion} is below the mobile minimum ${minimumVersion}.`,
        };
    }

    return { compatible: true, minimumVersion };
}

export function normalizeInstanceUrl(value?: string | null) {
    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    try {
        return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
            .toString()
            .replace(/\/$/, "");
    } catch {
        return "";
    }
}

export async function fetchVersion(baseUrl: string) {
    const payload = await firepitRequest<unknown>({
        baseUrl,
        path: "/api/version",
    });
    return normalizeVersionInfo(payload);
}

export async function fetchInstance(baseUrl: string) {
    return firepitRequest<InstanceMetadata>({ baseUrl, path: "/api/instance" });
}

export async function fetchAllowUserServers(baseUrl: string) {
    return firepitRequest<FeatureFlagState>({
        baseUrl,
        path: "/api/feature-flags/allow-user-servers",
    });
}

async function fetchCurrentUser(baseUrl: string, token: string) {
    const raw = await firepitRequest<CurrentUser>({ baseUrl, path: "/api/me", token });
    return normalizeCurrentUser(raw);
}

async function fetchCurrentUserFromAppwrite(
    config: AppwriteConfig,
    token: string,
) {
    // Try as session secret first (new auth flow), then fall back to JWT
    try {
        const sessionClient = createAppwriteClient(config).setSession(token);
        const sessionAccount = new Account(sessionClient);
        return normalizeCurrentUser(await sessionAccount.get());
    } catch (sessionError) {
        // Only fall back to JWT for auth failures (401 / invalid session);
        // rethrow genuine errors so real failures surface.
        const code = (sessionError as { code?: unknown })?.code;
        const type = (sessionError as { type?: unknown })?.type;
        const message = String(
            (sessionError as { message?: unknown })?.message ?? "",
        ).toLowerCase();
        const isAuthError =
            code === 401 ||
            type === "user_unauthorized" ||
            message.includes("unauthorized") ||
            message.includes("invalid session");
        if (!isAuthError) throw sessionError;

        // Fallback: try as JWT token
        const jwtClient = createAppwriteClient(config).setJWT(token);
        const jwtAccount = new Account(jwtClient);
        return normalizeCurrentUser(await jwtAccount.get());
    }
}

const PROFILE_ENRICHMENT_KEYS = [
    "displayName",
    "userName",
    "avatarUrl",
    "avatarFileId",
    "pronouns",
    "bio",
    "location",
    "website",
    "profileBackgroundColor",
    "profileBackgroundGradient",
    "profileBackgroundUrl",
    "avatarFramePreset",
    "avatarFrameUrl",
] as const;

async function fetchProfileEnrichment(
    baseUrl: string,
    token: string,
    userId: string,
): Promise<Partial<CurrentUser>> {
    try {
        const profile = await firepitRequest<Record<string, unknown>>({
            baseUrl,
            path: `/api/profile/${encodeURIComponent(userId)}`,
            token,
        });
        const merged: Partial<CurrentUser> = {};
        for (const key of PROFILE_ENRICHMENT_KEYS) {
            if (typeof profile[key] === "string" && (profile[key] as string).length > 0) {
                (merged as Record<string, unknown>)[key] = profile[key];
            }
        }
        return merged;
    } catch {
        // ignore profile fetch failure — displayName is non-critical
        return {};
    }
}

async function fetchMyRoles(
    baseUrl: string,
    token: string,
): Promise<Record<string, unknown> | undefined> {
    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/me`, {
            headers: authHeaders(token),
        });
        if (!res.ok) return undefined;
        const data = (await res.json()) as { roles?: Record<string, unknown> };
        return data.roles;
    } catch {
        return undefined;
    }
}

export async function resolveCurrentUser(
    baseUrl: string,
    token: string,
    config?: AppwriteConfig | null,
) {
    // Prefer a direct Appwrite call for identity: one warm round trip to the
    // always-on Appwrite backend instead of two round trips through the
    // (potentially hibernating) Next.js container. Profile + roles still come
    // from the server, fetched in parallel.
    if (config) {
        try {
            const directUser = await fetchCurrentUserFromAppwrite(config, token);
            if (directUser?.$id) {
                const [profile, roles] = await Promise.all([
                    fetchProfileEnrichment(baseUrl, token, directUser.$id),
                    fetchMyRoles(baseUrl, token),
                ]);
                return {
                    ...directUser,
                    ...profile,
                    ...(roles ? { roles } : {}),
                };
            }
        } catch {
            // fall through to the server path below
        }
    }

    try {
        const user = await fetchCurrentUser(baseUrl, token);
        // /api/me returns identity + roles; profile fields come from the profile endpoint
        if (user?.$id) {
            const profile = await fetchProfileEnrichment(baseUrl, token, user.$id);
            return { ...user, ...profile };
        }
        return user;
    } catch (error) {
        // If the server rejected the token (401/403), don't fall back to the
        // client SDK — the token is genuinely invalid and we need re-auth.
        if (error instanceof FirepitHttpError && (error.status === 401 || error.status === 403)) {
            throw error;
        }
        if (!config) {
            throw error;
        }

        return fetchCurrentUserFromAppwrite(config, token);
    }
}

export async function authenticateWithPassword(
    email: string,
    password: string,
    instanceUrl: string,
    config: AppwriteConfig,
) {
    if (!config.endpoint || !config.project) {
        throw new Error("Connect to a valid Firepit instance first.");
    }

    // POST to the server's /api/auth/session endpoint instead of using the
    // client SDK directly.  The server endpoint validates credentials via the
    // public Account API and returns the session secret.  This is the same
    // type of token the web app stores in its session cookie, so the server
    // can validate it with client.setSession().
    const response = await fetch(`${instanceUrl.replace(/\/$/, "")}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
            (errorData as { error?: string }).error ??
            `Authentication failed with status ${response.status}`;
        throw new Error(message);
    }

    const data = (await response.json()) as {
        success?: boolean;
        session?: string;
        userId?: string;
    };

    if (!data.session) {
        throw new Error("Authentication response did not include a session token.");
    }

    return data.session;
}
