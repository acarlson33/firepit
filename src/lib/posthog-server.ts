import { PostHog } from "posthog-node";

type PostHogShim = {
    capture: (...args: Parameters<PostHog["capture"]>) => void;
    captureException: (...args: Parameters<PostHog["captureException"]>) => void;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
};

function createNoOpShim(): PostHogShim {
    return {
        capture(..._args) {
            // no-op: PostHog project API key not configured
        },
        captureException(..._args) {
            // no-op: PostHog project API key not configured
        },
        async flush() {
            // no-op
        },
        async shutdown() {
            // no-op
        },
    };
}

let posthogClient: PostHog | PostHogShim | null = null;
let posthogProcessHandlersRegistered = false;

function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value;
    }

    return new Error(typeof value === "string" ? value : String(value));
}

function toErrorMetadata(value: unknown) {
    if (value instanceof Error) {
        return {
            errorMessage: value.message,
            errorName: value.name,
            errorStack: value.stack,
        };
    }

    return {
        errorMessage: typeof value === "string" ? value : String(value),
    };
}

async function waitWithTimeout(promise: Promise<void>, timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        await promise;
        return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
        await Promise.race([
            promise,
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export function getPostHogClient() {
    const projectApiKey =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
        "";
    const host =
        process.env.POSTHOG_HOST ??
        process.env.NEXT_PUBLIC_POSTHOG_HOST ??
        "https://us.i.posthog.com";

    if (!posthogClient) {
        if (!projectApiKey) {
            posthogClient = createNoOpShim();
        } else {
            // flushAt: 1 and flushInterval: 0 force immediate event delivery,
            // which is critical for serverless/short-lived processes where the
            // process may exit before a batch flush completes.
            posthogClient = new PostHog(projectApiKey, {
                host,
                flushAt: 1,
                flushInterval: 0,
            });
        }
    }
    return posthogClient;
}

export async function flushPostHog(timeoutMs = 1500) {
    const client = posthogClient;
    if (!client) {
        return;
    }

    try {
        await waitWithTimeout(client.flush(), timeoutMs);
    } catch {
        // Telemetry flushing should never impact request handling.
    }
}

export async function shutdownPostHog(timeoutMs = 1500) {
    const client = posthogClient;
    if (!client) {
        return;
    }

    try {
        await waitWithTimeout(client.shutdown(), timeoutMs);
    } catch {
        // Telemetry shutdown should never impact request handling.
    } finally {
        posthogClient = null;
    }
}

function captureUnhandledServerError(params: {
    error: unknown;
    origin: string;
}) {
    const { error, origin } = params;

    try {
        getPostHogClient().captureException(toError(error), "server", {
            origin,
            ...toErrorMetadata(error),
        });
    } catch {
        // Telemetry forwarding should never impact process-level handlers.
    }

    flushPostHog().catch(() => {
        // ignore background telemetry flush errors
    });
}

export function registerPostHogProcessHandlers() {
    if (posthogProcessHandlersRegistered || process.env.NODE_ENV === "test") {
        return;
    }

    posthogProcessHandlersRegistered = true;

    process.on("uncaughtExceptionMonitor", (error, origin) => {
        captureUnhandledServerError({
            error,
            origin: `uncaught_exception:${origin}`,
        });
    });

    process.on("unhandledRejection", (reason) => {
        captureUnhandledServerError({
            error: reason,
            origin: "unhandled_rejection",
        });
    });

    const flushLifecycleEvent = async (params?: {
        exitCode?: number;
        shouldExit?: boolean;
    }) => {
        const exitCode = params?.exitCode ?? 0;
        const shouldExit = params?.shouldExit ?? false;

        try {
            await flushPostHog();
        } catch {
            // ignore lifecycle telemetry flush errors
        } finally {
            if (shouldExit) {
                process.exit(exitCode);
            }
        }
    };

    process.on("beforeExit", () => {
        flushLifecycleEvent().catch(() => {});
    });
    process.once("SIGINT", () => {
        flushLifecycleEvent({
            exitCode: 130,
            shouldExit: true,
        }).catch(() => {});
    });
    process.once("SIGTERM", () => {
        flushLifecycleEvent({
            exitCode: 143,
            shouldExit: true,
        }).catch(() => {});
    });
}

/**
 * Captures a server error event but does not flush automatically.
 * In short-lived/serverless paths, call flushPostHog() after this to
 * improve delivery reliability before execution ends.
 */
export function capturePostHogServerError(
    error: unknown,
    properties?: Record<string, unknown>,
) {
    const errorObject = toError(error);

    try {
        getPostHogClient().captureException(errorObject, "server", {
            errorMessage: errorObject.message,
            errorName: errorObject.name,
            errorStack: errorObject.stack,
            ...properties,
        });
    } catch {
        // Telemetry forwarding should never impact request handling.
    }
}
