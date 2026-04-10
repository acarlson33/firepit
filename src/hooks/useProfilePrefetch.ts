"use client";

import { useCallback } from "react";

type CachedProfileEntry = {
    data: unknown;
    cachedAt: number;
};

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, CachedProfileEntry>();
const prefetchInProgress = new Set<string>();

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

export function useProfilePrefetch() {
    const prefetchProfile = useCallback(async (userId: string) => {
        if (getCachedProfileValue(userId) !== undefined) {
            return;
        }

        if (prefetchInProgress.has(userId)) {
            return;
        }

        prefetchInProgress.add(userId);

        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}/profile`,
            );
            if (response.ok) {
                const data = await response.json();
                setCachedProfileValue(userId, data);
            }
        } catch {
            // Silently fail - profile will be fetched when needed
        } finally {
            prefetchInProgress.delete(userId);
        }
    }, []);

    const getCachedProfile = useCallback((userId: string) => {
        return getCachedProfileValue(userId);
    }, []);

    const clearCache = useCallback(() => {
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

    getCachedProfile(userId: string): unknown | undefined {
        return getCachedProfileValue(userId);
    },

    add(userId: string) {
        if (
            getCachedProfileValue(userId) !== undefined ||
            profilePrefetchPool.queue.has(userId)
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

        const processNextBatch = async (): Promise<void> => {
            while (profilePrefetchPool.queue.size > 0) {
                const batch: string[] = [];
                for (const id of profilePrefetchPool.queue) {
                    if (batch.length >= concurrency) {
                        break;
                    }
                    batch.push(id);
                }

                for (const id of batch) {
                    profilePrefetchPool.queue.delete(id);
                }

                await Promise.all(
                    batch.map(async (userId) => {
                        if (getCachedProfileValue(userId) !== undefined) {
                            return;
                        }

                        try {
                            const response = await fetch(
                                `/api/users/${encodeURIComponent(userId)}/profile`,
                            );
                            if (response.ok) {
                                const data = await response.json();
                                setCachedProfileValue(userId, data);
                            }
                        } catch {
                            // Silently fail; modal can still fetch directly when needed.
                        }
                    }),
                );
            }
        };

        try {
            await processNextBatch();
        } finally {
            profilePrefetchPool.processing = false;
        }
    },
};
