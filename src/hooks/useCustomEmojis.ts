import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

  // Upload a new custom emoji
  const uploadEmoji = useCallback(
    async (file: File, name: string): Promise<void> => {
      setUploading(true);

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

        await response.json();

        // Invalidate query to trigger refetch from server
        await queryClient.invalidateQueries({ queryKey: ["customEmojis"] });
      } finally {
        setUploading(false);
      }
    },
    [customEmojis, queryClient]
  );

  // Delete a custom emoji
  const deleteEmoji = useCallback(
    async (fileId: string): Promise<void> => {
      try {
        const response = await fetch(`/api/upload-emoji?fileId=${fileId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete emoji");
        }

        // Invalidate query to trigger refetch from server
        await queryClient.invalidateQueries({ queryKey: ["customEmojis"] });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // biome-ignore lint: development debugging
          console.error("Failed to delete emoji:", error);
        }
        throw error;
      }
    },
    [customEmojis, queryClient]
  );

  return {
    customEmojis,
    isLoading,
    uploading,
    uploadEmoji,
    deleteEmoji,
  };
}
