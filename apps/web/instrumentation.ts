/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js on both server and edge runtimes.
 * It initializes server telemetry hooks for Node.js runtime only.
 *
 * Documentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const instrumentationLogger = {
    error(message: string, attributes?: Record<string, unknown>) {
        const payload = attributes
            ? `${message} ${JSON.stringify(attributes)}`
            : `${message}`;
        const error = new Error(payload);

        if (typeof globalThis.reportError === "function") {
            globalThis.reportError(error);
            return;
        }

        console.error(error);
    },
};

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const newrelicLicenseKey = process.env.NEW_RELIC_LICENSE_KEY;
        const newrelicAppName = process.env.NEW_RELIC_APP_NAME;

        try {
            const {
                initNewRelic,
                registerPostHogLoggerProvider,
                registerPostHogProcessHandlers,
            } = await import("./src/lib/newrelic-utils");
            registerPostHogLoggerProvider();
            registerPostHogProcessHandlers();

            // Kick off New Relic initialization once at startup so sync
            // dispatch paths can use the agent without async triggers.
            if (newrelicLicenseKey && newrelicAppName) {
                await initNewRelic();
            }
        } catch (error) {
            // PostHog runtime hooks are optional and should not block startup.
            instrumentationLogger.error(
                "[PostHog] Failed to register process handlers",
                {
                    error:
                        error instanceof Error
                            ? {
                                  message: error.message,
                                  name: error.name,
                                  stack: error.stack,
                              }
                            : String(error),
                },
            );
        }

        // Only initialize if both license key and app name are provided
        if (newrelicLicenseKey && newrelicAppName) {
            try {
                // Dynamic import to avoid loading New Relic on Edge runtime
                // New Relic will automatically load the newrelic.cjs config file
                const newrelic = await import("newrelic");

                // Return the newrelic instance for potential use
                return newrelic;
            } catch (error) {
                // If New Relic fails to initialize, log the error but don't crash the app
                console.error(
                    "[New Relic] Failed to initialize:",
                    error instanceof Error ? error.message : String(error),
                );
            }
        } else {
            // If credentials are missing, log a warning but don't fail
            if (!newrelicLicenseKey) {
                console.warn(
                    "[New Relic] NEW_RELIC_LICENSE_KEY not found - APM monitoring disabled",
                );
            }
            if (!newrelicAppName) {
                console.warn(
                    "[New Relic] NEW_RELIC_APP_NAME not found - APM monitoring disabled",
                );
            }
        }
    }
}
