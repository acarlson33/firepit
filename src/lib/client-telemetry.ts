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
            return;
        }

        posthog.capture("client_error", {
            errorMessage: error.message,
            errorName: error.name,
            errorStack: error.stack,
            ...attributes,
        });
    }
}
