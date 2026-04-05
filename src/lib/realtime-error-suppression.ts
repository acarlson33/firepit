export type RealtimeSubscription = {
    close: () => Promise<void>;
};

type ScopedConsoleErrorPredicate = (args: unknown[], marker: string) => boolean;

const subscriptionMarkers = new WeakMap<RealtimeSubscription, string>();
let subscriptionMarkerCounter = 0;

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

    // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
    const previousConsoleError = console.error;
    // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
    console.error = (...args: unknown[]) => {
        if (shouldSuppress(args, marker)) {
            return;
        }

        previousConsoleError(...args);
    };

    try {
        return await operation();
    } finally {
        // biome-ignore lint/suspicious/noConsole: Restore console.error immediately after scoped suppression.
        console.error = previousConsoleError;
    }
}

function defaultSuppressionPredicate(args: unknown[]): boolean {
    return isExpectedAppwriteWebSocketError(args);
}

/**
 * Suppress known noisy Appwrite websocket console errors while performing
 * intentional realtime teardown operations.
 */
export async function withSuppressedRealtimeCloseErrors<T>(
    operation: () => Promise<T>,
    options?: {
        marker?: string;
        shouldSuppress?: ScopedConsoleErrorPredicate;
    },
): Promise<T> {
    const marker = options?.marker ?? "realtime-close";
    const shouldSuppress =
        options?.shouldSuppress ??
        ((args: unknown[]) => defaultSuppressionPredicate(args));

    return runWithScopedConsoleErrorSuppressed(
        operation,
        marker,
        shouldSuppress,
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

    try {
        await withSuppressedRealtimeCloseErrors(
            async () => subscription.close(),
            {
                marker,
                shouldSuppress: (args: unknown[], activeMarker: string) =>
                    defaultSuppressionPredicate(args) &&
                    activeMarker === marker,
            },
        );
    } catch {
        // Ignore teardown errors when websocket is already disconnected.
    }
}
