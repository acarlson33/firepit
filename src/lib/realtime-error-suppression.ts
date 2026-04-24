import { logger } from "@/lib/client-logger";

type RealtimeSubscription =
    | {
          close: () => Promise<void> | void;
      }
    | (() => void);

type ScopedConsoleErrorPredicate = (args: unknown[], marker: string) => boolean;
type ConsoleErrorHandler = typeof console.error;
type ActiveSuppression = {
    id: number;
    marker: string;
    shouldSuppress: ScopedConsoleErrorPredicate;
};

let subscriptionMarkers = new WeakMap<RealtimeSubscription, string>();
const activeSuppressions: ActiveSuppression[] = [];
let subscriptionMarkerCounter = 0;
let activeSuppressionCounter = 0;
let originalConsoleError: ConsoleErrorHandler | null = null;

function isExpectedAppwriteWebSocketError(args: unknown[]): boolean {
    const [firstArg] = args;

    if (typeof firstArg !== "string") {
        return false;
    }

    if (firstArg.startsWith("WebSocket error:")) {
        // Appwrite emits WebSocket teardown noise with differing second-arg shapes
        // across browsers (Error/Event/string). During explicit close, suppress all.
        return true;
    }

    // Firefox/Appwrite can log this on intentional subscription churn during route switches.
    if (
        firstArg.includes("was interrupted while the page was loading") &&
        firstArg.includes("/v1/realtime")
    ) {
        return true;
    }

    if (
        firstArg.toLowerCase().includes("can’t establish a connection") &&
        firstArg.includes("/v1/realtime")
    ) {
        return true;
    }

    if (
        firstArg.toLowerCase().includes("can't establish a connection") &&
        firstArg.includes("/v1/realtime")
    ) {
        return true;
    }

    return false;
}

function getSubscriptionMarker(subscription: RealtimeSubscription): string {
    const existingMarker = subscriptionMarkers.get(subscription);
    if (existingMarker) {
        return existingMarker;
    }

    subscriptionMarkerCounter += 1;
    const marker = `realtime-close-${subscriptionMarkerCounter}`;
    subscriptionMarkers.set(subscription, marker);
    return marker;
}

async function runWithScopedConsoleErrorSuppressed<T>(
    operation: () => Promise<T>,
    marker: string,
    shouldSuppress: ScopedConsoleErrorPredicate,
): Promise<T> {
    if (typeof window === "undefined") {
        return operation();
    }

    if (!originalConsoleError) {
        // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
        const capturedConsoleError = console.error;
        originalConsoleError = capturedConsoleError;
        // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
        console.error = (...args: unknown[]) => {
            const shouldSuppressError = activeSuppressions.some((suppression) =>
                suppression.shouldSuppress(args, suppression.marker),
            );
            if (shouldSuppressError) {
                return;
            }

            capturedConsoleError(...args);
        };
    }

    activeSuppressionCounter += 1;
    const suppressionId = activeSuppressionCounter;
    activeSuppressions.push({
        id: suppressionId,
        marker,
        shouldSuppress,
    });

    try {
        return await operation();
    } finally {
        const suppressionIndex = activeSuppressions.findIndex(
            (suppression) => suppression.id === suppressionId,
        );
        if (suppressionIndex !== -1) {
            activeSuppressions.splice(suppressionIndex, 1);
        }

        if (activeSuppressions.length === 0 && originalConsoleError) {
            // biome-ignore lint/suspicious/noConsole: Restore original console.error when no scoped suppressions remain.
            console.error = originalConsoleError;
            originalConsoleError = null;
        }
    }
}

function defaultSuppressionPredicate(
    args: unknown[],
    _marker: string,
): boolean {
    // Appwrite websocket teardown logs do not embed marker context, so marker
    // scoping is enforced by the active suppression selection in
    // runWithScopedConsoleErrorSuppressed.
    return isExpectedAppwriteWebSocketError(args);
}

/**
 * Close a realtime subscription while suppressing expected websocket teardown noise.
 */
export async function closeSubscriptionSafely(
    subscription?: RealtimeSubscription,
): Promise<void> {
    if (!subscription) {
        return;
    }

    const marker = getSubscriptionMarker(subscription);
    const close =
        typeof subscription === "function"
            ? subscription
            : subscription.close.bind(subscription);

    try {
        await runWithScopedConsoleErrorSuppressed(
            async () => {
                await Promise.resolve(close());
            },
            marker,
            defaultSuppressionPredicate,
        );
    } catch (error) {
        if (process.env.NODE_ENV !== "production") {
            logger.warn("Realtime subscription close failed", {
                marker,
                error: error instanceof Error ? error.message : String(error),
            });
        } else {
            logger.info("Realtime subscription close failed (prod)", {
                marker,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // Ignore teardown errors when websocket is already disconnected.
    }
}
