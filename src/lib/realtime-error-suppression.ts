let suppressionDepth = 0;
let originalConsoleError: typeof console.error | null = null;

function isExpectedAppwriteWebSocketError(args: unknown[]): boolean {
    const [firstArg, secondArg] = args;

    if (typeof firstArg !== "string") {
        return false;
    }

    if (!firstArg.startsWith("WebSocket error:")) {
        return false;
    }

    if (secondArg instanceof Error) {
        return secondArg.message === "WebSocket error";
    }

    return secondArg === "WebSocket error";
}

function beginSuppression(): () => void {
    if (typeof window === "undefined") {
        return () => {
            // No-op during server execution.
        };
    }

    if (suppressionDepth === 0) {
        // biome-ignore lint/suspicious/noConsole: Intentional scoped interception of noisy Appwrite websocket close logs.
        originalConsoleError = console.error;
        // biome-ignore lint/suspicious/noConsole: Intentional scoped interception of noisy Appwrite websocket close logs.
        console.error = (...args: unknown[]) => {
            if (isExpectedAppwriteWebSocketError(args)) {
                return;
            }

            originalConsoleError?.(...args);
        };
    }

    suppressionDepth += 1;

    return () => {
        suppressionDepth = Math.max(0, suppressionDepth - 1);

        if (suppressionDepth === 0 && originalConsoleError) {
            // biome-ignore lint/suspicious/noConsole: Restore original console.error after scoped suppression.
            console.error = originalConsoleError;
            originalConsoleError = null;
        }
    };
}

/**
 * Suppress known noisy Appwrite websocket console errors while performing
 * intentional realtime teardown operations.
 */
export async function withSuppressedRealtimeCloseErrors<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const restore = beginSuppression();

    try {
        return await operation();
    } finally {
        restore();
    }
}
