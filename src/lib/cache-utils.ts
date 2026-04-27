/**
 * Simple cache utility with TTL support for reducing redundant API calls
 */

type CacheEntry<T> = {
    data: T;
    timestamp: number;
    ttl: number;
};

type PrefixTokenMetadata = {
    token: number;
    lastUsed: number;
};

const PREFIX_TOKEN_MAX_ENTRIES = 1024;
const PREFIX_TOKEN_TTL_MS = 60 * 60 * 1000;

class SimpleCache {
    private cache = new Map<string, CacheEntry<unknown>>();
    private pendingRequests = new Map<string, Promise<unknown>>();
    private prefixTokens = new Map<string, PrefixTokenMetadata>();

    private prunePrefixTokens(now = Date.now()): void {
        for (const [prefix, metadata] of this.prefixTokens.entries()) {
            if (now - metadata.lastUsed > PREFIX_TOKEN_TTL_MS) {
                this.prefixTokens.delete(prefix);
            }
        }

        if (this.prefixTokens.size <= PREFIX_TOKEN_MAX_ENTRIES) {
            return;
        }

        const entriesByLastUsed = Array.from(this.prefixTokens.entries()).sort(
            (left, right) => left[1].lastUsed - right[1].lastUsed,
        );

        const overflowCount = this.prefixTokens.size - PREFIX_TOKEN_MAX_ENTRIES;
        for (const [prefix] of entriesByLastUsed.slice(0, overflowCount)) {
            this.prefixTokens.delete(prefix);
        }
    }

    private capturePrefixTokensForKey(key: string): number {
        const now = Date.now();
        this.prunePrefixTokens(now);

        let token = 0;
        for (const [prefix, metadata] of this.prefixTokens.entries()) {
            if (key.startsWith(prefix)) {
                metadata.lastUsed = now;
                if (metadata.token > token) {
                    token = metadata.token;
                }
            }
        }

        return token;
    }

    private arePrefixTokensCurrent(key: string, token: number): boolean {
        return this.capturePrefixTokensForKey(key) === token;
    }

    /**
     * Get cached data if it exists and hasn't expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key) as CacheEntry<T> | undefined;
        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Set data in cache with TTL (in milliseconds)
     */
    set<T>(key: string, data: T, ttl: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
        });
    }

    /**
     * Clear specific key or entire cache
     */
    clear(key?: string): void {
        if (key) {
            this.cache.delete(key);
            this.pendingRequests.delete(key);
        } else {
            this.cache.clear();
            this.pendingRequests.clear();
            this.prefixTokens.clear();
        }
    }

    /**
     * Clear all cache and pending request entries that start with a prefix.
     */
    clearPrefix(prefix: string): void {
        const now = Date.now();
        const previousToken = this.prefixTokens.get(prefix)?.token ?? 0;
        this.prefixTokens.set(prefix, {
            token: previousToken + 1,
            lastUsed: now,
        });
        this.prunePrefixTokens(now);

        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }

        for (const key of this.pendingRequests.keys()) {
            if (key.startsWith(prefix)) {
                this.pendingRequests.delete(key);
            }
        }
    }

    /**
     * Deduplicate concurrent requests for the same key
     * If a request is already in flight, return the pending promise
     */
    async dedupe<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
    ): Promise<T> {
        // Check cache first
        const cached = this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // Check if request is already in flight
        const pending = this.pendingRequests.get(key) as Promise<T> | undefined;
        if (pending) {
            return pending;
        }

        // Execute new request
        const requestPrefixTokens = this.capturePrefixTokensForKey(key);
        const promise = fetcher()
            .then((data) => {
                if (this.arePrefixTokensCurrent(key, requestPrefixTokens)) {
                    this.set(key, data, ttl);
                }
                this.pendingRequests.delete(key);
                return data;
            })
            .catch((error: unknown) => {
                this.pendingRequests.delete(key);
                throw error;
            });

        this.pendingRequests.set(key, promise);
        return promise;
    }

    /**
     * Check if key exists and is valid
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Stale-while-revalidate pattern (Performance Optimization #3)
     * Returns cached data immediately (even if stale) while fetching fresh data in background
     *
     * @param {string} key - Cache key.
     * @param {() => Promise<T>} fetcher - Function that fetches fresh data.
     * @param {number} ttl - Time to live in milliseconds.
     * @param {(data: T) => void} [onUpdate] - Optional callback invoked when fresh data arrives.
     * @returns {Promise<T>} Cached data immediately, with fresh data provided via onUpdate when available.
     */
    async swr<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
        onUpdate?: (data: T) => void,
    ): Promise<T> {
        const entry = this.cache.get(key) as CacheEntry<T> | undefined;
        const now = Date.now();

        // Return cached data immediately if it exists (even if expired)
        const hasStaleData = entry !== undefined;
        const isExpired = entry && now - entry.timestamp > entry.ttl;

        // If we have data (stale or fresh), return it immediately
        if (hasStaleData) {
            // If expired, fetch fresh data in background
            if (isExpired) {
                // Check if request is already in flight
                const pending = this.pendingRequests.get(key) as
                    | Promise<T>
                    | undefined;
                if (!pending) {
                    const requestPrefixTokens = this.capturePrefixTokensForKey(
                        key,
                    );
                    // Execute background refresh
                    const promise = fetcher()
                        .then((data) => {
                            if (
                                this.arePrefixTokensCurrent(
                                    key,
                                    requestPrefixTokens,
                                )
                            ) {
                                this.set(key, data, ttl);
                            }
                            this.pendingRequests.delete(key);
                            if (onUpdate) {
                                onUpdate(data);
                            }
                            return data;
                        })
                        .catch((error: unknown) => {
                            this.pendingRequests.delete(key);
                            // Don't throw on background refresh failure
                            if (process.env.NODE_ENV === "development") {
                                console.error(
                                    `SWR background refresh failed for key: ${key}`,
                                    error,
                                );
                            }
                            return entry.data;
                        });

                    this.pendingRequests.set(key, promise);
                }
            }

            return entry.data;
        }

        // No cached data, fetch normally (blocking)
        return this.dedupe(key, fetcher, ttl);
    }
}

// Export singleton instance
export const apiCache = new SimpleCache();

/**
 * Cache TTL constants (in milliseconds)
 */
export const CACHE_TTL = {
    // Static data that rarely changes
    SERVERS: 5 * 60 * 1000, // 5 minutes
    CHANNELS: 3 * 60 * 1000, // 3 minutes
    CATEGORIES: 3 * 60 * 1000, // 3 minutes
    MEMBERSHIPS: 5 * 60 * 1000, // 5 minutes

    // User data
    PROFILES: 10 * 60 * 1000, // 10 minutes
    USER_STATUS: 30 * 1000, // 30 seconds

    // Dynamic data (shorter TTL)
    MESSAGES: 10 * 1000, // 10 seconds
    CONVERSATIONS: 2 * 60 * 1000, // 2 minutes
} as const;
