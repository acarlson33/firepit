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

