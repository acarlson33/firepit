import type { UserStatus } from "./types";

const ALLOWED_STATUSES = new Set<UserStatus["status"]>([
    "online",
    "away",
    "busy",
    "offline",
]);

export const STATUS_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export type StatusLike = {
    $id?: unknown;
    userId?: unknown;
    status?: unknown;
    customMessage?: unknown;
    lastSeenAt?: unknown;
    expiresAt?: unknown;
    isManuallySet?: unknown;
    $updatedAt?: unknown;
};

/**
 * Handles coerce timestamp.
 *
 * @param {unknown} value - The value value.
 * @returns {string | undefined} The return value.
 */
function coerceTimestamp(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const time = Date.parse(value);
    if (Number.isNaN(time)) {
        return undefined;
    }

    return value;
}

/**
 * Normalizes status.
 *
 * @param {{ $id?: unknown; userId?: unknown; status?: unknown; customMessage?: unknown; lastSeenAt?: unknown; expiresAt?: unknown; isManuallySet?: unknown; $updatedAt?: unknown; }} input - The input value.
 * @param {number} now - The now value, if provided.
 * @returns {{ normalized: UserStatus; isExpired: boolean; isStale: boolean; shouldAutoOffline: boolean; }} The return value.
 */
export function normalizeStatus(input: StatusLike, now = Date.now()) {
    const lastSeenCandidate =
        coerceTimestamp(input.lastSeenAt) ?? coerceTimestamp(input.$updatedAt);
    const lastSeenAt = lastSeenCandidate ?? new Date(0).toISOString();
    const lastSeenTime = Date.parse(lastSeenAt);

    const expiresAt = coerceTimestamp(input.expiresAt);
    const expiresTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const hasExpiresAt = Number.isFinite(expiresTime);

    const rawStatus =
        typeof input.status === "string" &&
        ALLOWED_STATUSES.has(input.status as UserStatus["status"])
            ? (input.status as UserStatus["status"])
            : "offline";

    const isExpired = hasExpiresAt && expiresTime <= now;
    const isStale =
        !Number.isFinite(lastSeenTime) ||
        now - lastSeenTime > STATUS_STALE_THRESHOLD_MS;

    const isManuallySet =
        input.isManuallySet !== undefined
            ? Boolean(input.isManuallySet)
            : undefined;

    const manualActive =
        Boolean(isManuallySet) && (!hasExpiresAt || expiresTime > now);

    const normalizedStatus: UserStatus["status"] =
        manualActive || (!isExpired && !isStale) ? rawStatus : "offline";

    const normalized: UserStatus = {
        $id: String(input.$id ?? ""),
        userId: String(input.userId ?? ""),
        status: normalizedStatus,
        customMessage: input.customMessage
            ? String(input.customMessage)
            : undefined,
        lastSeenAt,
        expiresAt,
        isManuallySet,
        $updatedAt: coerceTimestamp(input.$updatedAt),
    };

    return {
        normalized,
        isExpired,
        isStale,
        shouldAutoOffline:
            !manualActive && (isExpired || isStale) && rawStatus !== "offline",
    };
}
