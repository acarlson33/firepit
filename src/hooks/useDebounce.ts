"use client";
import { useEffect, useRef, useCallback } from "react";

/**
 * Debounced batch update hook
 * Batches multiple state updates within a time window to reduce re-renders
 * 
 * @param callback - Function to call with batched updates
 * @param delay - Debounce delay in milliseconds (default: 150ms)
 * @returns Function to schedule updates
 */
export function useDebouncedBatchUpdate<T>(
  callback: (items: T[]) => void,
  delay = 150
) {
  const pendingUpdates = useRef<T[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flush = useCallback(() => {
    if (pendingUpdates.current.length > 0) {
      callback(pendingUpdates.current);
      pendingUpdates.current = [];
    }
    timeoutRef.current = null;
  }, [callback]);

  const scheduleUpdate = useCallback(
    (item: T) => {
      pendingUpdates.current.push(item);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(flush, delay);
    },
    [flush, delay]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        flush(); // Flush any pending updates
      }
    };
  }, [flush]);

  return scheduleUpdate;
}

/**
 * Throttled function hook
 * Ensures a function is called at most once per time period
 * 
 * @param callback - Function to throttle
 * @param delay - Throttle delay in milliseconds (default: 150ms)
 * @returns Throttled function
 */
export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay = 150
): T {
  const lastRun = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttled = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        // Execute immediately if enough time has passed
        lastRun.current = now;
        callback(...args);
      } else {
        // Schedule for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(
          () => {
            lastRun.current = Date.now();
            callback(...args);
            timeoutRef.current = null;
          },
          delay - timeSinceLastRun
        );
      }
    },
    [callback, delay]
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttled;
}
