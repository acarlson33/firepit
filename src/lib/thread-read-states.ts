export type ThreadReadContextType = "channel" | "conversation";

/**
 * Normalizes thread reads.
 *
 * @param {unknown} value - The value value.
 * @returns {{ [x: string]: string; }} The return value.
 */
export function normalizeThreadReads(value: unknown): Record<string, string> {
    if (!value) {
        return {};
    }

    const candidate =
        typeof value === "string"
            ? (() => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return null;
                  }
              })()
            : value;

    if (!candidate || typeof candidate !== "object") {
        return {};
    }

    return Object.entries(candidate).reduce<Record<string, string>>(
        (accumulator, [messageId, readAt]) => {
            if (typeof messageId === "string" && typeof readAt === "string") {
                accumulator[messageId] = readAt;
            }

            return accumulator;
        },
        {},
    );
}

/**
 * Determines whether is thread unread.
 *
 * @param {{ lastReadAt?: string | undefined; lastThreadReplyAt?: string | undefined; threadMessageCount?: number | undefined; }} params - The params value.
 * @returns {boolean} The return value.
 */
export function isThreadUnread(params: {
    lastReadAt?: string;
    lastThreadReplyAt?: string;
    threadMessageCount?: number;
}) {
    const { lastReadAt, lastThreadReplyAt, threadMessageCount } = params;

    if (!threadMessageCount || !lastThreadReplyAt) {
        return false;
    }

    if (!lastReadAt) {
        return true;
    }

    return lastReadAt.localeCompare(lastThreadReplyAt) < 0;
}
