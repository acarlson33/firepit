"use client";

import { useCallback, useRef } from "react";

const profileCache = new Map<string, unknown>();
const prefetchInProgress = new Set<string>();

export function useProfilePrefetch() {
    const cacheRef = useRef<Map<string, unknown>>(profileCache);

    const prefetchProfile = useCallback(async (userId: string) => {
        if (cacheRef.current.has(userId)) {
            return;
        }

        if (prefetchInProgress.has(userId)) {
            return;
        }

        prefetchInProgress.add(userId);

        try {
            const response = await fetch(`/api/users/${userId}/profile`);
            if (response.ok) {
                const data = await response.json();
                cacheRef.current.set(userId, data);
            }
        } catch {
            // Silently fail - profile will be fetched when needed
        } finally {
            prefetchInProgress.delete(userId);
        }
    }, []);

    const getCachedProfile = useCallback((userId: string) => {
        return cacheRef.current.get(userId);
    }, []);

    const clearCache = useCallback(() => {
        cacheRef.current.clear();
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
        return profileCache.get(userId);
    },

    add(userId: string) {
        if (profileCache.has(userId) || this.queue.has(userId)) {
            return;
        }
        this.queue.add(userId);
        void this.process();
    },

    async process() {
        if (this.processing || this.queue.size === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.size > 0) {
            const batch = [...this.queue].slice(0, this.maxConcurrent);
            for (const id of batch) {
                this.queue.delete(id);
            }
            await Promise.all(
                batch.map(async (userId) => {
                    if (!profileCache.has(userId)) {
                        try {
                            const response = await fetch(
                                `/api/users/${userId}/profile`,
                            );
                            if (response.ok) {
                                const data = await response.json();
                                profileCache.set(userId, data);
                            }
                        } catch {
                            // Silently fail
                        }
                    }
                }),
            );
        }

        this.processing = false;
    },
};
