/**
 * Reaction utilities for parsing and handling message reactions
 */

export type Reaction = {
    emoji: string;
    userIds: string[];
    count: number;
};

export type ParsedReactionsResult = {
    reactions: Reaction[];
    didNormalize: boolean;
};

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
 * Parse reactions data from Appwrite (can be JSON string or array)
 * @param reactionsData - The reactions data from the database (string, array, or undefined)
 * @returns Parsed array of reactions
 */
export function parseReactions(
    reactionsData: string | Reaction[] | undefined,
): Reaction[] {
    return parseReactionsWithMetadata(reactionsData).reactions;
}
