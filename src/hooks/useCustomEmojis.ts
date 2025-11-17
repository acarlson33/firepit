import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeResponseEvent } from "appwrite";
import type { CustomEmoji } from "@/lib/types";

const EMOJIS_STORAGE_KEY = "firepit_custom_emojis";

// Helper to get emojis from localStorage (for offline cache)
function getStoredEmojis(): CustomEmoji[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(EMOJIS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to store emojis in localStorage (for offline cache)
function storeEmojis(emojis: CustomEmoji[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(EMOJIS_STORAGE_KEY, JSON.stringify(emojis));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // biome-ignore lint: development debugging
      console.error("Failed to store emojis:", error);
    }
  }
}

// Fetch emojis from the server
async function fetchEmojisFromServer(): Promise<CustomEmoji[]> {
  try {
    const response = await fetch("/api/custom-emojis");
    if (!response.ok) {
      throw new Error("Failed to fetch emojis");
    }
    const emojis: CustomEmoji[] = await response.json();
    // Cache in localStorage for offline access
    storeEmojis(emojis);
    return emojis;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      // biome-ignore lint: development debugging
      console.error("Failed to fetch emojis from server:", error);
    }
    // Fallback to cached emojis
    return getStoredEmojis();
  }
}

/**
 * Hook for managing custom emojis with localStorage caching
 */
export function useCustomEmojis() {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  // Use React Query for caching and automatic refetching from server
  const { data: customEmojis = [], isLoading } = useQuery({
    queryKey: ["customEmojis"],
    queryFn: fetchEmojisFromServer,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Subscribe to realtime updates for custom emojis storage bucket
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let unsubscribe: (() => void) | undefined;

    // Dynamically import realtime pool to avoid SSR issues
    import("@/lib/realtime-pool")
      .then(({ getSharedClient, trackSubscription }) => {
        const bucketId = process.env.NEXT_PUBLIC_APPWRITE_EMOJIS_BUCKET_ID;
        if (!bucketId) {
          return;
        }

        const client = getSharedClient();
        
        // Subscribe to all file events in the emojis bucket
        const channel = `buckets.${bucketId}.files`;
        const untrack = trackSubscription(channel);

        const handleStorageEvent = (
          event: RealtimeResponseEvent<Record<string, unknown>>
        ) => {
          // Refetch emojis on any storage event (create, update, delete)
          if (
            event.events.includes(`buckets.*.files.*.create`) ||
            event.events.includes(`buckets.*.files.*.delete`) ||
            event.events.includes(`buckets.${bucketId}.files.*.create`) ||
            event.events.includes(`buckets.${bucketId}.files.*.delete`)
          ) {
            // Invalidate and refetch immediately
            void queryClient.invalidateQueries({ queryKey: ["customEmojis"] });
          }
        };

        try {
          const unsub = client.subscribe(channel, handleStorageEvent);
          unsubscribe = () => {
            if (typeof unsub === "function") {
              unsub();
            }
            untrack();
          };
        } catch {
          // Failed to set up realtime; ignore silently
          untrack();
        }
      })
      .catch(() => {
        // Failed to import realtime pool; ignore silently
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [queryClient]);

  // Upload a new custom emoji
  const uploadEmoji = useCallback(
    async (file: File, name: string): Promise<void> => {
      setUploading(true);

      // Create temporary emoji for optimistic update
      const tempEmojiId = `temp_${Date.now()}`;
      const tempEmoji: CustomEmoji = {
        fileId: tempEmojiId,
        url: URL.createObjectURL(file), // Use object URL for immediate preview
        name,
      };

      // Optimistically add the emoji to the UI
      queryClient.setQueryData<CustomEmoji[]>(["customEmojis"], (old = []) => {
        return [...old, tempEmoji];
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name);

        const response = await fetch("/api/upload-emoji", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to upload emoji");
        }

        const result = await response.json();

        // Replace temporary emoji with real one
        queryClient.setQueryData<CustomEmoji[]>(["customEmojis"], (old = []) => {
          return old.map(emoji => 
            emoji.fileId === tempEmojiId 
              ? { fileId: result.fileId, url: result.url, name: result.name }
              : emoji
          );
        });

        // Trigger full refetch to sync with server (in background)
        void queryClient.invalidateQueries({ queryKey: ["customEmojis"] });
      } catch (error) {
        // Remove the optimistic emoji on error
        queryClient.setQueryData<CustomEmoji[]>(["customEmojis"], (old = []) => {
          return old.filter(emoji => emoji.fileId !== tempEmojiId);
        });
        throw error;
      } finally {
        setUploading(false);
        // Clean up object URL to avoid memory leaks
        URL.revokeObjectURL(tempEmoji.url);
      }
    },
    [queryClient]
  );

  // Delete a custom emoji
  const deleteEmoji = useCallback(
    async (fileId: string): Promise<void> => {
      // Store the emoji being deleted for rollback on error
      const previousEmojis = queryClient.getQueryData<CustomEmoji[]>(["customEmojis"]);

      // Optimistically remove the emoji from UI
      queryClient.setQueryData<CustomEmoji[]>(["customEmojis"], (old = []) => {
        return old.filter(emoji => emoji.fileId !== fileId);
      });

      try {
        const response = await fetch(`/api/upload-emoji?fileId=${fileId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete emoji");
        }

        // Trigger full refetch to sync with server (in background)
        void queryClient.invalidateQueries({ queryKey: ["customEmojis"] });
      } catch (error) {
        // Rollback on error
        if (previousEmojis) {
          queryClient.setQueryData(["customEmojis"], previousEmojis);
        }

        if (process.env.NODE_ENV === 'development') {
          // biome-ignore lint: development debugging
          console.error("Failed to delete emoji:", error);
        }
        throw error;
      }
    },
    [queryClient]
  );

  return {
    customEmojis,
    isLoading,
    uploading,
    uploadEmoji,
    deleteEmoji,
  };
}
