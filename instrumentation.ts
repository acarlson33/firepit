/**
 * Next.js Instrumentation Hook
 * 
 * This file is automatically loaded by Next.js on both server and edge runtimes.
 * It initializes PostHog for server-side analytics and monitoring.
 * 
 * Documentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only initialize PostHog on the Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

    // Only initialize if PostHog key is provided
    if (posthogKey) {
      try {
        // Dynamic import to avoid loading PostHog on Edge runtime
        const { initPostHog } = await import("./src/lib/posthog-utils");
        
        const posthog = initPostHog();
        
        if (posthog) {
          console.log(`[PostHog] Initialized successfully`);
          console.log(`[PostHog] Features enabled:`);
          console.log(`  - Product Analytics`);
          console.log(`  - Error Tracking`);
          console.log(`  - Session Recording`);
          console.log(`  - Feature Flags`);
          console.log(`  - A/B Testing`);
          console.log(`  - Custom Events and Properties`);
        }
        
        return posthog;
      } catch (error) {
        // If PostHog fails to initialize, log the error but don't crash the app
        console.error("[PostHog] Failed to initialize:", error instanceof Error ? error.message : String(error));
      }
    } else {
      // If credentials are missing, log a warning but don't fail
      console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_KEY not found - analytics disabled");
    }
  }
}
