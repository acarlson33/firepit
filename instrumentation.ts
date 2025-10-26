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
      try {
        // Dynamic import to avoid loading New Relic on Edge runtime
        // New Relic will automatically load the newrelic.cjs config file
        const newrelic = await import("newrelic");
        
        console.log(`[New Relic] Initialized for app: ${newrelicAppName}`);
        console.log(`[New Relic] Configuration loaded from newrelic.cjs`);
        console.log(`[New Relic] Features enabled:`);
        console.log(`  - Application Performance Monitoring (APM)`);
        console.log(`  - Error Tracking`);
        console.log(`  - Transaction Tracing`);
        console.log(`  - Distributed Tracing`);
        console.log(`  - Application Logging`);
        console.log(`  - Custom Events and Metrics`);
        console.log(`  - Browser Monitoring (RUM)`);
        
        // Return the newrelic instance for potential use
        return newrelic;
      } catch (error) {
        // If New Relic fails to initialize, log the error but don't crash the app
        console.error("[New Relic] Failed to initialize:", error instanceof Error ? error.message : String(error));
      }
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
