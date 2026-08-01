import { logger } from "@/lib/client-logger";

export type RealtimeSubscription =
    | {
          unsubscribe?: () => Promise<void> | void;
          close: () => Promise<void> | void;
      }
    | (() => void);

function isExpectedTeardownError(error: unknown): boolean {
    if (typeof DOMException !== "undefined" && error instanceof DOMException) {
        return true;
    }

    const candidate =
        typeof error === "object" && error !== null
            ? (error as { message?: unknown; name?: unknown })
            : null;

    if (candidate?.name === "AbortError") {
        return true;
    }

    const msg = (
        candidate && typeof candidate.message === "string"
            ? candidate.message
            : String(error)
    ).toLowerCase();

    return (
        msg.includes("websocket error") ||
        msg.includes("closing or closed") ||
        msg.includes("already in closing") ||
        msg.includes("closed before") ||
        msg.includes("aborterror") ||
        msg.includes("domexception") ||
        (msg.includes("was interrupted while the page was loading") &&
            msg.includes("/v1/realtime")) ||
        (msg.includes("can't establish a connection") &&
            msg.includes("/v1/realtime"))
    );
}

/**
 * Close a realtime subscription, suppressing expected websocket teardown errors.
 */
export async function closeSubscriptionSafely(
    subscription?: RealtimeSubscription,
): Promise<void> {
    if (!subscription) {
        return;
    }

    const teardown =
        typeof subscription === "function"
            ? subscription
            : typeof subscription.unsubscribe === "function"
              ? subscription.unsubscribe.bind(subscription)
              : subscription.close.bind(subscription);

    try {
        await Promise.resolve(teardown());
    } catch (error) {
        const level = isExpectedTeardownError(error) ? "info" : "warn";
        logger[level]("Realtime subscription close failed", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
