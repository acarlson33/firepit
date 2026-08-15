import { logger } from "@/lib/client-logger";

export type RealtimeSubscription =
    | {
          unsubscribe?: () => Promise<void> | void;
          close: () => Promise<void> | void;
      }
    | (() => void);

function isExpectedTeardownError(error: unknown): boolean {
    const expectedDomExceptionNames = new Set([
        "AbortError",
        "InvalidStateError",
        "NetworkError",
    ]);

    if (
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        expectedDomExceptionNames.has(error.name)
    ) {
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

    let teardown: () => Promise<void> | void;
    if (typeof subscription === "function") {
        teardown = subscription;
    } else if (typeof subscription.unsubscribe === "function") {
        teardown = subscription.unsubscribe.bind(subscription);
    } else {
        teardown = subscription.close.bind(subscription);
    }

    try {
        await Promise.resolve(teardown());
    } catch (error) {
        const level = isExpectedTeardownError(error) ? "info" : "warn";
        logger[level]("Realtime subscription close failed", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
