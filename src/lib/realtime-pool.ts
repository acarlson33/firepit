/**
 * Realtime subscription pool to reduce connection churn
 * Shares a single Appwrite Client instance across components
 */

import { Client } from "appwrite";
import { Realtime } from "appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";

let sharedClient: Client | null = null;
let sharedRealtime: Realtime | null = null;
const subscriptionRefs = new Map<string, number>();

/**
 * Get or create shared Appwrite client
 * @returns {Client} The return value.
 */
export function getSharedClient(): Client {
    if (!sharedClient) {
        const { endpoint, project } = getEnvConfig();

        sharedClient = new Client().setEndpoint(endpoint).setProject(project);

        // Enable SDK diagnostics in development so realtime errors surface locally.
        if (process.env.NODE_ENV !== "production") {
            const clientWithLogging = sharedClient as Client & {
                setLogLevel?: (
                    level: "debug" | "info" | "warning" | "error" | "none",
                ) => Client;
            };
            clientWithLogging.setLogLevel?.("debug");
        }
    }

    return sharedClient;
}

/**
 * Get or create shared Appwrite realtime helper
 * @returns {Realtime} The return value.
 */
export function getSharedRealtime(): Realtime {
    if (!sharedRealtime) {
        sharedRealtime = new Realtime(getSharedClient());
    }

    return sharedRealtime;
}

/**
 * Track subscription references to prevent premature cleanup
 *
 * @param {string} channel - The channel value.
 * @returns {() => void} The return value.
 */
export function trackSubscription(channel: string): () => void {
    const count = subscriptionRefs.get(channel) ?? 0;
    subscriptionRefs.set(channel, count + 1);

    return () => {
        const newCount = (subscriptionRefs.get(channel) ?? 1) - 1;
        if (newCount <= 0) {
            subscriptionRefs.delete(channel);
        } else {
            subscriptionRefs.set(channel, newCount);
        }
    };
}

/**
 * Check if a channel has active subscriptions
 *
 * @param {string} channel - The channel value.
 * @returns {boolean} The return value.
 */
export function hasActiveSubscriptions(channel: string): boolean {
    return (subscriptionRefs.get(channel) ?? 0) > 0;
}

/**
 * Close active realtime websocket resources before resetting singleton state.
 */
export async function disposeSharedRealtime(): Promise<void> {
    if (!sharedRealtime) {
        subscriptionRefs.clear();
        return;
    }

    try {
        const activeSubscriptions = Reflect.get(
            sharedRealtime as object,
            "activeSubscriptions",
        );
        if (activeSubscriptions instanceof Map) {
            activeSubscriptions.clear();
        }

        const reconnect = Reflect.get(sharedRealtime as object, "reconnect");
        if (typeof reconnect === "boolean") {
            Reflect.set(sharedRealtime as object, "reconnect", false);
        }

        const closeSocket = Reflect.get(
            sharedRealtime as object,
            "closeSocket",
        );
        if (typeof closeSocket === "function") {
            await (closeSocket as (this: Realtime) => Promise<void>).call(
                sharedRealtime,
            );
        }
    } finally {
        sharedRealtime = null;
        subscriptionRefs.clear();
    }
}

/**
 * Reset the shared realtime helper and tracked subscription references.
 * Use this on auth/session transitions so a fresh realtime context is created.
 */
export function resetSharedRealtime(): void {
    sharedRealtime = null;
    subscriptionRefs.clear();
}

/**
 * Reset the shared Appwrite client singleton.
 */
export function resetSharedClient(): void {
    sharedClient = null;
    resetSharedRealtime();
}
