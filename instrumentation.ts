/**
 * Next.js Instrumentation Hook
 * 
 * This file is automatically loaded by Next.js on both server and edge runtimes.
 * It initializes New Relic APM for server-side monitoring.
 * 
 * Documentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only initialize New Relic on the Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const newrelicLicenseKey = process.env.NEW_RELIC_LICENSE_KEY;
    const newrelicAppName = process.env.NEW_RELIC_APP_NAME;

    // Only initialize if both license key and app name are provided
    if (newrelicLicenseKey && newrelicAppName) {
      // Dynamic import to avoid loading New Relic on Edge runtime
      const newrelic = await import("newrelic");
      
      // New Relic is configured via environment variables:
      // - NEW_RELIC_LICENSE_KEY: Your New Relic license key
      // - NEW_RELIC_APP_NAME: Your application name in New Relic
      // Additional configuration can be done via newrelic.config object if needed
      
      console.log(`[New Relic] Initialized for app: ${newrelicAppName}`);
      
      // Return the newrelic instance for potential use
      return newrelic;
    } else {
      // If credentials are missing, log a warning but don't fail
      if (!newrelicLicenseKey) {
        console.warn("[New Relic] NEW_RELIC_LICENSE_KEY not found - APM monitoring disabled");
      }
      if (!newrelicAppName) {
        console.warn("[New Relic] NEW_RELIC_APP_NAME not found - APM monitoring disabled");
      }
    }
  }
}
