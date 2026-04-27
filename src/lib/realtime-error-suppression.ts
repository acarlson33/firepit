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

const subscriptionMarkers = new WeakMap<RealtimeSubscription, string>();
const activeSuppressions: ActiveSuppression[] = [];
let subscriptionMarkerCounter = 0;
let activeSuppressionCounter = 0;
let originalConsoleError: ConsoleErrorHandler | null = null;

function matchWebSocketErrorMessage(message: string): boolean {
    const normalizedMessage = message.replace(/\u2019/g, "'").toLowerCase();

    if (message.startsWith("WebSocket error:")) {
        return true;
    }

    // Firefox/Appwrite can log this on intentional subscription churn during route switches.
    if (
        message.includes("was interrupted while the page was loading") &&
        message.includes("/v1/realtime")
    ) {
        return true;
    }

    if (
        normalizedMessage.includes("can't establish a connection") &&
        normalizedMessage.includes("/v1/realtime")
    ) {
        return true;
    }

    return false;
}

function isExpectedAppwriteWebSocketError(args: unknown[]): boolean {
    const [firstArg] = args;

    if (typeof firstArg !== "string") {
        return false;
    }

    // Appwrite emits WebSocket teardown noise with differing second-arg shapes
    // across browsers (Error/Event/string). During explicit close, suppress all.
    return matchWebSocketErrorMessage(firstArg);
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

function isBenignThrownTeardownError(error: unknown): boolean {
    const candidate =
        typeof error === "object" && error !== null
            ? (error as { message?: unknown; name?: unknown })
            : null;

    if (typeof DOMException !== "undefined" && error instanceof DOMException) {
        return true;
    }

    if (candidate && candidate.name === "AbortError") {
        return true;
    }

    const errorMessage =
        candidate && typeof candidate.message === "string"
            ? candidate.message
            : String(error);
    const normalized = errorMessage.toLowerCase();

    return (
        matchWebSocketErrorMessage(errorMessage) ||
        normalized.includes("closing or closed") ||
        normalized.includes("already in closing") ||
        normalized.includes("closed before") ||
        normalized.includes("aborterror") ||
        normalized.includes("domexception")
    );
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
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        const isBenignTeardownError = isBenignThrownTeardownError(error);

        if (isBenignTeardownError) {
            logger.info("Realtime subscription close failed", {
                marker,
                error: errorMessage,
            });
        } else {
            logger.warn("Realtime subscription close failed", {
                marker,
                error: errorMessage,
            });
        }

        // Ignore teardown errors when websocket is already disconnected.
    }
}
