export type RealtimeSubscription = {
    close: () => Promise<void>;
};

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

    if (!originalConsoleError) {
        // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
        originalConsoleError = console.error;
        // biome-ignore lint/suspicious/noConsole: Intentionally scoped interception for explicit realtime teardown.
        console.error = (...args: unknown[]) => {
            const shouldSuppressError = activeSuppressions.some((suppression) =>
                suppression.shouldSuppress(args, suppression.marker),
            );
            if (shouldSuppressError) {
                return;
            }

            originalConsoleError?.(...args);
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
        options?.shouldSuppress ?? defaultSuppressionPredicate;

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
                shouldSuppress: defaultSuppressionPredicate,
            },
        );
    } catch {
        // Ignore teardown errors when websocket is already disconnected.
    }
}
