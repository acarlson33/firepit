/**
 * Initialize the Appwrite realtime WebSocket authentication.
 *
 * The Appwrite SDK reads `cookieFallback` from localStorage to authenticate
 * the realtime WebSocket. Since the app uses a same-origin Next.js proxy
 * (no direct cross-origin requests to Appwrite), the SDK never receives
 * `X-Fallback-Cookies` response headers, so `cookieFallback` is never
 * populated by the SDK itself.
 *
 * This module fetches the session from the server (which can read the
 * httpOnly cookie) and stores it in localStorage so the SDK can use it.
 *
 * Import and call `initRealtimeAuth()` once at app startup, before any
 * realtime subscriptions are created.
 */

let initPromise: Promise<void> | null = null;

export function initRealtimeAuth(): Promise<void> {
    if (initPromise) {
        return initPromise;
    }

    // Already populated — nothing to do
    if (
        typeof window !== "undefined" &&
        window.localStorage.getItem("cookieFallback")
    ) {
        return Promise.resolve();
    }

    initPromise = (async () => {
        try {
            const response = await fetch("/api/session");
            if (!response.ok) return;
            const data = (await response.json()) as {
                session?: string;
                project?: string;
            };
            if (
                data.session &&
                data.project &&
                typeof window !== "undefined"
            ) {
                window.localStorage.setItem(
                    "cookieFallback",
                    JSON.stringify({
                        [`a_session_${data.project}`]: data.session,
                    }),
                );
            }
        } catch {
            // Silent — realtime will just be unauthenticated
        }
    })();

    return initPromise;
}
