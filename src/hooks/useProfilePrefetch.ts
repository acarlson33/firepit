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
    queue: [] as string[],
    processing: false,
    maxConcurrent: 3,

    getCachedProfile(userId: string): unknown | undefined {
        return profileCache.get(userId);
    },

    add(userId: string) {
        if (!this.queue.includes(userId)) {
            this.queue.push(userId);
        }
        void this.process();
    },

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, this.maxConcurrent);
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
