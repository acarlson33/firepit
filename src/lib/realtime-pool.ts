/**
 * Realtime subscription pool to reduce connection churn
 * Shares a single Appwrite Client instance across components
 */

import { Client, Realtime } from "appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/client-logger";

let sharedClient: Client | null = null;
let sharedRealtime: Realtime | null = null;
const subscriptionRefs = new Map<string, number>();
let warnedAboutFallbackTeardown = false;
let inFlightDispose: Promise<void> | null = null;
let subscribeQueueTail: Promise<void> = Promise.resolve();
let sharedRealtimeGeneration = 0;

function queueRealtimeOperation<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = subscribeQueueTail
        .catch(() => {
            // Keep realtime operation queue progressing even if an earlier operation failed.
        })
        .then(() => operation());

    subscribeQueueTail = nextOperation.then(
        () => undefined,
        () => undefined,
    );

    return nextOperation;
}

function queueRealtimeSubscribe<T>(
    generationAtEnqueue: number,
    operation: () => Promise<T>,
): Promise<T> {
    return queueRealtimeOperation(() => {
        if (generationAtEnqueue !== sharedRealtimeGeneration) {
            throw new Error(
                "Skipped stale realtime subscribe after generation change",
            );
        }

        return operation();
    });
}

function toUnsubscribeFn(subscription: unknown): () => void {
    if (typeof subscription === "function") {
        return subscription;
    }

    if (
        subscription &&
        typeof subscription === "object" &&
        typeof (subscription as { close?: unknown }).close === "function"
    ) {
        const close = (subscription as { close: () => unknown }).close.bind(
            subscription,
        );
        return () => {
            const closeResult = close();
            if (isPromiseLike(closeResult)) {
                void Promise.resolve(closeResult).catch((error) => {
                    logger.warn(
                        "Realtime subscription close failed in unsubscribe wrapper",
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    );
                });
            }
        };
    }

    throw new Error("Realtime subscribe returned an invalid handle");
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isTransientRealtimeSubscribeError(error: unknown): boolean {
    const message = toErrorMessage(error).toLowerCase();

    return (
        message.includes("was interrupted while the page was loading") ||
        message.includes("can't establish a connection") ||
        message.includes("can’t establish a connection") ||
        message.includes("websocket error")
    );
}

function patchRealtimeSubscribe(realtime: Realtime): Realtime {
    const realtimeWithMetadata = realtime as Realtime & {
        __firepitSubscribePatched?: boolean;
        __firepitGeneration?: number;
    };

    if (realtimeWithMetadata.__firepitSubscribePatched) {
        return realtime;
    }

    const baseSubscribe = realtime.subscribe.bind(realtime);
    const wrappedSubscribe: Realtime["subscribe"] = (...args) => {
        const generation = realtimeWithMetadata.__firepitGeneration;
        const queuedUnsubscribe = queueRealtimeSubscribe(
            typeof generation === "number"
                ? generation
                : sharedRealtimeGeneration,
            async () => {
                try {
                    const subscription = await Promise.resolve(
                        baseSubscribe(...args),
                    );
                    return toUnsubscribeFn(subscription);
                } catch (error) {
                    if (!isTransientRealtimeSubscribeError(error)) {
                        throw error;
                    }

                    logger.info(
                        "Retrying realtime subscribe after transient connection failure",
                        {
                            error: toErrorMessage(error),
                        },
                    );

                    await Promise.resolve();

                    const retrySubscription = await Promise.resolve(
                        baseSubscribe(...args),
                    );
                    return toUnsubscribeFn(retrySubscription);
                }
            },
        );

        const deferredUnsubscribe = (() => {
            void queuedUnsubscribe
                .then((unsubscribe) => {
                    unsubscribe();
                })
                .catch((error) => {
                    logger.warn("Deferred realtime unsubscribe failed", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                });
        }) as (() => void) & PromiseLike<() => void>;
        deferredUnsubscribe.then =
            queuedUnsubscribe.then.bind(queuedUnsubscribe);

        return deferredUnsubscribe;
    };
    realtime.subscribe = wrappedSubscribe;

    realtimeWithMetadata.__firepitSubscribePatched = true;
    return realtime;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { then?: unknown }).then === "function"
    );
}

async function callLifecycleMethodIfPresent(
    target: object,
    methodName: string,
): Promise<boolean> {
    const method = Reflect.get(target, methodName);
    if (typeof method !== "function") {
        return false;
    }

    const result = (method as (...args: unknown[]) => unknown).call(target);
    if (isPromiseLike(result)) {
        await result;
    }

    return true;
}

function collectSubscriptionLikeValues(candidate: unknown): unknown[] {
    if (!candidate) {
        return [];
    }

    if (candidate instanceof Map) {
        return Array.from(candidate.values());
    }

    if (candidate instanceof Set) {
        return Array.from(candidate.values());
    }

    if (Array.isArray(candidate)) {
        return candidate;
    }

    if (typeof candidate === "object") {
        return Object.values(candidate as Record<string, unknown>);
    }

    return [];
}

async function callPublicRealtimeTeardown(
    realtime: Realtime,
): Promise<boolean> {
    const lifecycleMethods = ["close", "disconnect", "dispose"] as const;
    let instanceLevelTeardown = false;

    for (const methodName of lifecycleMethods) {
        try {
            const called = await callLifecycleMethodIfPresent(
                realtime as object,
                methodName,
            );
            if (called) {
                instanceLevelTeardown = true;
                break;
            }
        } catch {
            // Try the next lifecycle method if this one throws.
        }
    }

    if (instanceLevelTeardown) {
        return true;
    }

    const subscriptionContainers = [
        Reflect.get(realtime as object, "subscriptions"),
        Reflect.get(realtime as object, "activeSubscriptions"),
    ];

    let closedAnySubscription = false;

    for (const container of subscriptionContainers) {
        const maybeSubscriptions = collectSubscriptionLikeValues(container);
        for (const maybeSubscription of maybeSubscriptions) {
            if (!maybeSubscription || typeof maybeSubscription !== "object") {
                continue;
            }

            try {
                const didClose =
                    (await callLifecycleMethodIfPresent(
                        maybeSubscription,
                        "close",
                    )) ||
                    (await callLifecycleMethodIfPresent(
                        maybeSubscription,
                        "unsubscribe",
                    ));

                if (didClose) {
                    closedAnySubscription = true;
                }
            } catch {
                // Continue trying additional subscription-like values.
            }
        }
    }

    if (closedAnySubscription) {
        return true;
    }

    const internalClient = Reflect.get(realtime as object, "client");
    if (internalClient && typeof internalClient === "object") {
        try {
            const closedClient = await callLifecycleMethodIfPresent(
                internalClient,
                "close",
            );
            if (closedClient) {
                return true;
            }
        } catch {
            // Let the caller continue to fallback internals.
        }
    }

    return false;
}

async function safeCleanupRealtime(realtime: Realtime): Promise<void> {
    const disposedViaPublicApi = await callPublicRealtimeTeardown(realtime);
    if (disposedViaPublicApi) {
        return;
    }

    if (!warnedAboutFallbackTeardown) {
        warnedAboutFallbackTeardown = true;
        logger.warn(
            "safeCleanupRealtime fallback path used; realtime public teardown API failed or unavailable",
            {
                hasClose:
                    typeof Reflect.get(realtime as object, "close") ===
                    "function",
                hasDisconnect:
                    typeof Reflect.get(realtime as object, "disconnect") ===
                    "function",
                hasDispose:
                    typeof Reflect.get(realtime as object, "dispose") ===
                    "function",
            },
        );
    }

    // Track an upstream request for a stable public teardown API:
    // https://github.com/acarlson33/firepit/issues/175
    const activeSubscriptions = Reflect.get(
        realtime as object,
        "activeSubscriptions",
    );
    if (activeSubscriptions instanceof Map) {
        activeSubscriptions.clear();
    }

    const reconnect = Reflect.get(realtime as object, "reconnect");
    if (typeof reconnect === "boolean") {
        Reflect.set(realtime as object, "reconnect", false);
    }

    const closeSocket = Reflect.get(realtime as object, "closeSocket");
    if (typeof closeSocket === "function") {
        const result = (closeSocket as (this: Realtime) => unknown).call(
            realtime,
        );
        if (isPromiseLike(result)) {
            await result;
        }
    }
}

async function waitForSubscribeQueueToDrain(): Promise<void> {
    await subscribeQueueTail.catch(() => {
        // Ignore stale subscribe failures while draining queue during teardown.
    });
}

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
        sharedRealtimeGeneration += 1;
        const realtime = new Realtime(getSharedClient()) as Realtime & {
            __firepitGeneration?: number;
        };
        realtime.__firepitGeneration = sharedRealtimeGeneration;
        sharedRealtime = patchRealtimeSubscribe(realtime);
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
    if (inFlightDispose) {
        await inFlightDispose;
        return;
    }

    const disposePromise = (async () => {
        sharedRealtimeGeneration += 1;
        const disposeGeneration = sharedRealtimeGeneration;

        await waitForSubscribeQueueToDrain();

        if (!sharedRealtime) {
            subscriptionRefs.clear();
            subscribeQueueTail = Promise.resolve();
            return;
        }

        const realtime = sharedRealtime;

        try {
            await safeCleanupRealtime(realtime);
        } finally {
            if (
                sharedRealtime === realtime &&
                sharedRealtimeGeneration === disposeGeneration
            ) {
                sharedRealtime = null;
                subscriptionRefs.clear();
                subscribeQueueTail = Promise.resolve();
            }
        }
    })();

    inFlightDispose = disposePromise;

    try {
        await disposePromise;
    } finally {
        if (inFlightDispose === disposePromise) {
            inFlightDispose = null;
        }
    }
}

/**
 * Reset the shared realtime helper and tracked subscription references.
 * Use this on auth/session transitions so a fresh realtime context is created.
 */
export async function resetSharedRealtime(): Promise<void> {
    await disposeSharedRealtime();
}

/**
 * Reset the shared Appwrite client singleton.
 */
export async function resetSharedClient(): Promise<void> {
    await disposeSharedRealtime();
    sharedClient = null;
}
