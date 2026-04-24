/**
 * Reaction utilities for parsing and handling message reactions
 */

export type Reaction = {
    emoji: string;
    userIds: string[];
    count: number;
};

type ParsedReactionsResult = {
    reactions: Reaction[];
    didNormalize: boolean;
};

/**
 * normalizeReaction validates and normalizes one reaction entry.
 * Invalid entries are dropped (returns null), including missing/invalid emoji
 * or non-object values. userIds are filtered to non-empty strings, deduplicated,
 * and count is repaired from userIds when needed.
 *
 * @param {unknown} reaction - Raw reaction candidate from storage.
 * @returns {Reaction | null} Normalized reaction, or null when the input is not valid.
 */
function normalizeReaction(reaction: unknown): Reaction | null {
    if (!reaction || typeof reaction !== "object") {
        return null;
    }

    const value = reaction as Record<string, unknown>;
    if (typeof value.emoji !== "string") {
        return null;
    }

    const userIds = Array.isArray(value.userIds)
        ? Array.from(
              new Set(
                  value.userIds.filter(
                      (userId): userId is string =>
                          typeof userId === "string" && userId.length > 0,
                  ),
              ),
          )
        : [];
    const count =
        typeof value.count === "number" && Number.isFinite(value.count)
            ? value.count
            : userIds.length;

    return {
        emoji: value.emoji,
        userIds,
        count: userIds.length > 0 ? userIds.length : Math.max(0, count),
    };
}

/**
 * normalizeLegacyReactionMap converts legacy emoji-keyed reaction objects to the
 * current Reaction[] shape. Invalid legacy entries are skipped and userIds are
 * normalized to unique non-empty strings.
 *
 * @param {{ [x: string]: unknown; }} reactionsData - Legacy emoji -> payload mapping.
 * @returns {Reaction[]} Normalized reactions in the current array format.
 */
function normalizeLegacyReactionMap(
    reactionsData: Record<string, unknown>,
): Reaction[] {
    const reactions: Reaction[] = [];

    for (const [emoji, value] of Object.entries(reactionsData)) {
        if (Array.isArray(value)) {
            const userIds = Array.from(
                new Set(
                    value.filter(
                        (userId): userId is string =>
                            typeof userId === "string" && userId.length > 0,
                    ),
                ),
            );
            reactions.push({ emoji, userIds, count: userIds.length });
            continue;
        }

        if (value && typeof value === "object") {
            const normalized = normalizeReaction({
                emoji,
                ...(value as Record<string, unknown>),
            });
            if (normalized) {
                reactions.push(normalized);
            }
        }
    }

    return reactions;
}

/**
 * parseReactionsWithMetadata normalizes Appwrite reaction payloads across shapes:
 * JSON strings, current Reaction[] arrays, and legacy emoji maps. Invalid entries
 * are dropped during normalization and legacy shapes are converted to Reaction[].
 * didNormalize is true when repairs/coercions occur (for example, dropping invalid
 * rows, deduplicating userIds, or converting a legacy map).
 *
 * @param {unknown} reactionsData - Raw reactions payload from storage.
 * @returns {{ reactions: Reaction[]; didNormalize: boolean; }} Normalized reactions plus a flag indicating whether normalization changed the input.
 */
export function parseReactionsWithMetadata(
    reactionsData: unknown,
): ParsedReactionsResult {
    if (!reactionsData) {
        return { reactions: [], didNormalize: false };
    }

    if (typeof reactionsData === "string") {
        try {
            const parsed = JSON.parse(reactionsData);
            const normalized = parseReactionsWithMetadata(parsed);
            return {
                reactions: normalized.reactions,
                didNormalize: normalized.didNormalize || !Array.isArray(parsed),
            };
        } catch {
            return { reactions: [], didNormalize: false };
        }
    }

    if (Array.isArray(reactionsData)) {
        const reactions = reactionsData
            .map((reaction) => normalizeReaction(reaction))
            .filter((reaction): reaction is Reaction => reaction !== null);
        return {
            reactions,
            didNormalize: reactions.length !== reactionsData.length,
        };
    }

    if (typeof reactionsData === "object") {
        return {
            reactions: normalizeLegacyReactionMap(
                reactionsData as Record<string, unknown>,
            ),
            didNormalize: true,
        };
    }

    return { reactions: [], didNormalize: false };
}

/**
 * parseReactions returns normalized reactions only, discarding metadata.
 * Accepts current array payloads and serialized JSON forms; invalid entries are
 * removed as part of normalization.
 *
 * @param {string | Reaction[] | undefined} reactionsData - Stored reactions payload.
 * @returns {Reaction[]} Normalized reactions ready for client/server consumers.
 */
export function parseReactions(
    reactionsData: string | Reaction[] | undefined,
): Reaction[] {
    return parseReactionsWithMetadata(reactionsData).reactions;
}
