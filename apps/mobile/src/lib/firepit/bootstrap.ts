import { Account, Client } from "react-native-appwrite";

import { firepitRequest } from "@/lib/firepit/http";
import {
  type CompatibilityEvaluation,
  type CurrentUser,
  type FeatureFlagState,
  type InstanceMetadata,
  type VersionInfo,
} from "@/lib/firepit/types";

export const MOBILE_MINIMUM_SERVER_VERSION = "1.9.0";
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

function normalizeConfiguredUrl(value: unknown) {
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

  return {
    $id: typeof candidate.$id === "string" ? candidate.$id : undefined,
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    email: typeof candidate.email === "string" ? candidate.email : undefined,
    displayName:
      typeof candidate.name === "string" ? candidate.name : undefined,
    userName: typeof candidate.name === "string" ? candidate.name : undefined,
    avatarUrl:
      typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : undefined,
    roles:
      typeof candidate.roles === "object" && candidate.roles !== null
        ? (candidate.roles as Record<string, unknown>)
        : undefined,
  };
}

export function extractAppwriteConfig(
  instance: InstanceMetadata,
): AppwriteConfig | null {
  const endpoint = normalizeConfiguredUrl(
    instance.appwriteEndpoint ?? instance["appwriteEndpoint"],
  );
  const project =
    (typeof instance.appwriteProjectId === "string" &&
      instance.appwriteProjectId.trim()) ||
    (typeof instance["appwriteProjectId"] === "string" &&
      instance["appwriteProjectId"].trim()) ||
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

function extractToken(response: Record<string, unknown>) {
  const tokenKeys = [
    "token",
    "accessToken",
    "bearerToken",
    "sessionToken",
    "jwt",
  ];
  for (const key of tokenKeys) {
    const value = response[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
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

export async function fetchCurrentUser(baseUrl: string, token: string) {
  console.log(
    "[bootstrap] fetchCurrentUser - token present:",
    !!token,
    "token length:",
    token?.length ?? 0,
  );
  return firepitRequest<CurrentUser>({ baseUrl, path: "/api/me", token });
}

async function fetchCurrentUserFromAppwrite(
  config: AppwriteConfig,
  token: string,
) {
  const client = createAppwriteClient(config).setJWT(token);
  const account = new Account(client);
  return normalizeCurrentUser(await account.get());
}

export async function resolveCurrentUser(
  baseUrl: string,
  token: string,
  config?: AppwriteConfig | null,
) {
  try {
    return await fetchCurrentUser(baseUrl, token);
  } catch (error) {
    if (!config) {
      throw error;
    }

    console.log(
      "[bootstrap] resolveCurrentUser - falling back to Appwrite account.get()",
    );
    return fetchCurrentUserFromAppwrite(config, token);
  }
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  config: AppwriteConfig,
) {
  if (!config.endpoint || !config.project) {
    throw new Error("Connect to a valid Firepit instance first.");
  }

  const client = createAppwriteClient(config);
  const account = new Account(client);

  let session;
  try {
    console.log(
      "[bootstrap] authenticateWithPassword - creating session for:",
      email,
    );
    session = await account.createEmailPasswordSession({ email, password });
    console.log("[bootstrap] authenticateWithPassword - session created");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Appwrite may reject session creation when a session is already active for
    // the current client context. Attempt to clear the current session and
    // retry once.
    if (
      message.toLowerCase().includes("session is active") ||
      message.toLowerCase().includes("prohibited when a session is active")
    ) {
      try {
        // best-effort: delete the current session then retry
        // ignore any error from deleteSession and re-attempt login once
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(
          "[bootstrap] authenticateWithPassword - session active, clearing",
        );
        await (account as any).deleteSession({ sessionId: "current" });
      } catch (_deleteErr) {
        // swallow deletion errors and continue to retry
      }

      session = await account.createEmailPasswordSession({ email, password });
    } else {
      throw err;
    }
  }

  // Always use JWT bearer tokens instead of session cookies for cross-origin compatibility.
  // This ensures token-based auth works reliably on web (where SameSite/CORS cookie issues arise).
  console.log("[bootstrap] authenticateWithPassword - creating JWT");
  const jwt = await account.createJWT();
  console.log(
    "[bootstrap] authenticateWithPassword - JWT created, length:",
    jwt.jwt?.length ?? 0,
  );
  if (jwt.jwt) {
    return jwt.jwt;
  }

  throw new Error("Authentication response did not include a JWT token.");
}
