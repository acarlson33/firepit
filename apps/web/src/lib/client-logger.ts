/**
 * Client-side logger with telemetry routing.
 * Dispatches events to browser New Relic and/or PostHog
 * based on NEXT_PUBLIC_TELEMETRY_PROVIDER.
 * Falls back to console in development.
 */

type ClientTelemetryProvider = "newrelic" | "posthog" | "both" | "none";

type BrowserNewRelic = {
    addPageAction: (name: string, attrs?: Record<string, unknown>) => void;
    noticeError: (error: Error, attrs?: Record<string, unknown>) => void;
};

type BrowserPostHog = {
    capture: (event: string, properties?: Record<string, unknown>) => void;
    captureException?: (
        error: Error,
        properties?: Record<string, unknown>,
    ) => void;
};

function getClientTelemetryProvider(): ClientTelemetryProvider {
    const rawProvider =
        process.env.NEXT_PUBLIC_TELEMETRY_PROVIDER?.toLowerCase();
    if (
        rawProvider === "newrelic" ||
        rawProvider === "posthog" ||
        rawProvider === "both" ||
        rawProvider === "none"
    ) {
        return rawProvider;
    }

    return "newrelic";
}

function shouldSendToNewRelic() {
    const provider = getClientTelemetryProvider();
    return provider === "newrelic" || provider === "both";
}

function shouldSendToPostHog() {
    const provider = getClientTelemetryProvider();
    return provider === "posthog" || provider === "both";
}

function getBrowserNewRelic(): BrowserNewRelic | null {
    if (typeof window === "undefined") {
        return null;
    }

    return (
        (
            window as unknown as {
                newrelic?: BrowserNewRelic;
            }
        ).newrelic ?? null
    );
}

function getBrowserPostHog(): BrowserPostHog | null {
    if (typeof window === "undefined") {
        return null;
    }

    return (
        (
            window as unknown as {
                posthog?: BrowserPostHog;
            }
        ).posthog ?? null
    );
}

export function recordClientAction(
    action: string,
    attributes?: Record<string, unknown>,
) {
    const newrelic = getBrowserNewRelic();
    if (shouldSendToNewRelic() && newrelic) {
        newrelic.addPageAction(action, attributes);
    }

    const posthog = getBrowserPostHog();
    if (shouldSendToPostHog() && posthog) {
        posthog.capture(action, attributes);
    }
}

export function recordClientError(
    error: Error,
    attributes?: Record<string, unknown>,
) {
    const newrelic = getBrowserNewRelic();
    if (shouldSendToNewRelic() && newrelic) {
        newrelic.noticeError(error, attributes);
    }

    const posthog = getBrowserPostHog();
    if (shouldSendToPostHog() && posthog) {
        if (posthog.captureException) {
            posthog.captureException(error, attributes);
        } else {
            posthog.capture("client_error", {
                errorMessage: error.message,
                errorName: error.name,
                errorStack: error.stack,
                ...attributes,
            });
        }
    }
}

interface LogAttributes {
    [key: string]: string | number | boolean | null | undefined;
}

class ClientLogger {
    private shouldLog(): boolean {
        return process.env.NODE_ENV !== "production";
    }

    info(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_info", { message, ...attributes });

        if (this.shouldLog()) {
            console.log(`[INFO] ${message}`, attributes ?? "");
        }
    }

    warn(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_warn", { message, ...attributes });

        if (this.shouldLog()) {
            console.warn(`[WARN] ${message}`, attributes ?? "");
        }
    }

    error(
        message: string,
        error?: Error | string,
        attributes?: LogAttributes,
    ): void {
        if (error instanceof Error) {
            recordClientError(error, { message, ...attributes });
        } else {
            recordClientAction("log_error", {
                message,
                error: error?.toString(),
                ...attributes,
            });
        }

        if (this.shouldLog()) {
            console.error(`[ERROR] ${message}`, error ?? "", attributes ?? "");
        }
    }

    debug(message: string, attributes?: LogAttributes): void {
        if (this.shouldLog()) {
            console.log(`[DEBUG] ${message}`, attributes ?? "");
        }
    }
}

export const logger = new ClientLogger();
