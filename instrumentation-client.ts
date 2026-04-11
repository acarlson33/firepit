import posthog from "posthog-js";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const isDevelopment = process.env.NODE_ENV === "development";
const autoCaptureEnabled =
    process.env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE === "true";
const sessionRecordingEnabled =
    process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING === "true";
const capturePageviewEnabled =
    process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_PAGEVIEW !== "false";
const requestBatchingEnabled =
    process.env.NEXT_PUBLIC_POSTHOG_REQUEST_BATCHING !== "false";

if (posthogToken && posthogHost) {
    posthog.init(posthogToken, {
        api_host: posthogHost,
        request_batching: requestBatchingEnabled,
        autocapture: autoCaptureEnabled,
        capture_pageview: capturePageviewEnabled,
        disable_session_recording: !sessionRecordingEnabled,
        // 2026-01-30 is the PostHog configuration snapshot version that
        // controls default settings; explicit options above override it.
        defaults: "2026-01-30",
        // Enable exception autocapture for PostHog Error Tracking.
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
        // Turn on debug in development mode
        debug: isDevelopment,
    });
}

//IMPORTANT: Never combine this approach with other client-side PostHog initialization approaches, especially components like a PostHogProvider. instrumentation-client.ts is the correct solution for initializating client-side PostHog in Next.js 15.3+ apps.
