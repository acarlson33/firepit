/**
 * Simple cache utility with TTL support for reducing redundant API calls
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private pendingRequests = new Map<string, Promise<unknown>>();

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
    }
  }

  /**
   * Deduplicate concurrent requests for the same key
   * If a request is already in flight, return the pending promise
   */
  async dedupe<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
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
    const promise = fetcher()
      .then((data) => {
        this.set(key, data, ttl);
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
   * @param key - Cache key
   * @param fetcher - Function to fetch fresh data
   * @param ttl - Time to live in milliseconds
   * @param onUpdate - Optional callback when fresh data arrives
   * @returns Cached data immediately, fresh data arrives via onUpdate
   */
  async swr<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    onUpdate?: (data: T) => void
  ): Promise<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    
    // Return cached data immediately if it exists (even if expired)
    const hasStaleData = entry !== undefined;
    const isExpired = entry && (now - entry.timestamp > entry.ttl);
    
    // If we have data (stale or fresh), return it immediately
    if (hasStaleData) {
      // If expired, fetch fresh data in background
      if (isExpired) {
        // Check if request is already in flight
        const pending = this.pendingRequests.get(key) as Promise<T> | undefined;
        if (!pending) {
          // Execute background refresh
          const promise = fetcher()
            .then((data) => {
              this.set(key, data, ttl);
              this.pendingRequests.delete(key);
              if (onUpdate) {
                onUpdate(data);
              }
              return data;
            })
            .catch((error: unknown) => {
              this.pendingRequests.delete(key);
              // Don't throw on background refresh failure
              console.error(`SWR background refresh failed for key: ${key}`, error);
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
  MEMBERSHIPS: 5 * 60 * 1000, // 5 minutes
  
  // User data
  PROFILES: 10 * 60 * 1000, // 10 minutes
  USER_STATUS: 30 * 1000, // 30 seconds
  
  // Dynamic data (shorter TTL)
  MESSAGES: 10 * 1000, // 10 seconds
  CONVERSATIONS: 2 * 60 * 1000, // 2 minutes
} as const;
