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
 * coerceTimestamp converts a candidate value to an ISO timestamp string when valid.
 *
 * @param {unknown} value - The input to coerce (for example a string, number, or Date-like value).
 * @returns {string | undefined} ISO 8601 timestamp string if coercion succeeds, otherwise undefined.
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
 * normalizeStatus applies status defaults and expiry/staleness rules to StatusLike input.
 *
 * @param {StatusLike} input - Raw status document to normalize.
 * @param {number} now - Epoch milliseconds used for deterministic expiration checks.
 * @returns {{ normalized: UserStatus; isExpired: boolean; isStale: boolean; shouldAutoOffline: boolean; }} Normalized status payload and computed lifecycle flags.
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
