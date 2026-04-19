"use client";

import { useCallback } from "react";

type CachedProfileEntry = {
    data: unknown;
    cachedAt: number;
};

type InFlightProfileFetch = {
    controller: AbortController;
    promise: Promise<void>;
};

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, CachedProfileEntry>();
const inFlightProfileFetches = new Map<string, InFlightProfileFetch>();

function getCachedProfileValue(userId: string): unknown | undefined {
    const entry = profileCache.get(userId);
    if (!entry) {
        return undefined;
    }

    if (Date.now() - entry.cachedAt > PROFILE_CACHE_TTL_MS) {
        profileCache.delete(userId);
        return undefined;
    }

    return entry.data;
}

function setCachedProfileValue(userId: string, data: unknown): void {
    profileCache.set(userId, {
        data,
        cachedAt: Date.now(),
    });
}

function fetchProfileIntoCache(userId: string): Promise<void> {
    const existing = inFlightProfileFetches.get(userId);
    if (existing) {
        return existing.promise;
    }

    const controller = new AbortController();

    const requestPromise = (async () => {
        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}/profile`,
                { signal: controller.signal },
            );
            if (response.ok) {
                const data = await response.json();
                setCachedProfileValue(userId, data);
            }
        } catch {
            // Silently fail - profile will be fetched when needed.
        } finally {
            inFlightProfileFetches.delete(userId);
        }
    })();

    inFlightProfileFetches.set(userId, {
        controller,
        promise: requestPromise,
    });
    return requestPromise;
}

function useProfilePrefetch() {
    const prefetchProfile = useCallback(async (userId: string) => {
        if (getCachedProfileValue(userId) !== undefined) {
            return;
        }

        const existing = inFlightProfileFetches.get(userId);
        if (existing) {
            await existing.promise;
            return;
        }

        await fetchProfileIntoCache(userId);
    }, []);

    const getCachedProfile = useCallback((userId: string) => {
        return getCachedProfileValue(userId);
    }, []);

    const clearCache = useCallback(() => {
        for (const inFlight of inFlightProfileFetches.values()) {
            inFlight.controller.abort();
        }
        inFlightProfileFetches.clear();
        profileCache.clear();
    }, []);

    return {
        prefetchProfile,
        getCachedProfile,
        clearCache,
    };
}

export const profilePrefetchPool = {
    queue: new Set<string>(),
    processing: false,
    maxConcurrent: 3,

    dequeueNext(): string | undefined {
        const iterator = profilePrefetchPool.queue.values().next();
        if (iterator.done || typeof iterator.value !== "string") {
            return undefined;
        }

        profilePrefetchPool.queue.delete(iterator.value);
        return iterator.value;
    },

    getCachedProfile(userId: string): unknown | undefined {
        return getCachedProfileValue(userId);
    },

    add(userId: string) {
        if (
            getCachedProfileValue(userId) !== undefined ||
            profilePrefetchPool.queue.has(userId) ||
            inFlightProfileFetches.has(userId)
        ) {
            return;
        }

        profilePrefetchPool.queue.add(userId);
        profilePrefetchPool.process().catch(() => {});
    },

    async process() {
        if (
            profilePrefetchPool.processing ||
            profilePrefetchPool.queue.size === 0
        ) {
            return;
        }

        profilePrefetchPool.processing = true;
        const concurrency = Math.max(1, profilePrefetchPool.maxConcurrent);

        try {
            const runWorker = async (): Promise<void> => {
                while (true) {
                    const userId = profilePrefetchPool.dequeueNext();
                    if (!userId) {
                        return;
                    }

                    if (getCachedProfileValue(userId) !== undefined) {
                        continue;
                    }

                    await fetchProfileIntoCache(userId);
                }
            };

            const workers = Array.from({ length: concurrency }, runWorker);

            await Promise.all(workers);
        } finally {
            profilePrefetchPool.processing = false;

            if (profilePrefetchPool.queue.size > 0) {
                profilePrefetchPool.process().catch(() => {});
            }
        }
    },
};
