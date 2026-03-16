"use client";

import posthog from "posthog-js";

let hasInitialized = false;

export function PostHogClientInit() {
    if (hasInitialized) {
        return null;
    }

    const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const isDevelopment = process.env.NODE_ENV === "development";

    if (!posthogToken || !posthogHost) {
        return null;
    }

    posthog.init(posthogToken, {
        api_host: posthogHost,
        request_batching: !isDevelopment,
        defaults: "2026-01-30",
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
        debug: isDevelopment,
        loaded: () => {
            if (isDevelopment) {
                console.info("[PostHog][client] loaded (layout init)", {
                    apiHost: posthogHost,
                    requestBatching: !isDevelopment,
                });
            }
        },
    });

    hasInitialized = true;

    if (isDevelopment) {
        console.info("[PostHog][client] initialized (layout init)", {
            apiHost: posthogHost,
            tokenPresent: Boolean(posthogToken),
        });
    }

    return null;
}
