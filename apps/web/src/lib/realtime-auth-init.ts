/**
 * Initialize the Appwrite realtime WebSocket authentication.
 *
 * This module fetches a short-lived JWT from the server (which can read the
 * httpOnly cookie) and sets it on the shared Appwrite client, so the SDK can
 * authenticate the realtime WebSocket without the raw session secret.
 *
 * Import and call `initRealtimeAuth()` once at app startup, before any
 * realtime subscriptions are created.
 */

import { getSharedClient } from "@/lib/realtime-pool";

let initPromise: Promise<void> | null = null;

export function initRealtimeAuth(): Promise<void> {
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const response = await fetch("/api/session", {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
            throw new Error(
                `Session request failed with status ${response.status}`,
            );
        }
        const data = (await response.json()) as { jwt?: string };
        if (data.jwt) {
            getSharedClient().setJWT(data.jwt);
        }
    })().catch(() => {
        // Silent — realtime will just be unauthenticated. Clear the cached
        // promise so a later call can retry.
        initPromise = null;
    });

    return initPromise;
}
