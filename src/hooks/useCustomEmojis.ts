import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "appwrite";
import type { RealtimeResponseEvent } from "appwrite";
import { logger } from "@/lib/client-logger";
import { closeSubscriptionSafely } from "@/lib/realtime-error-suppression";
import type { CustomEmoji } from "@/lib/types";

const EMOJIS_STORAGE_KEY = "firepit_custom_emojis";

function isCustomEmoji(value: unknown): value is CustomEmoji {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.fileId === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.url === "string"
    );
}

function validateCustomEmojis(value: unknown): CustomEmoji[] {
    if (!Array.isArray(value)) {
        throw new Error("Custom emoji response is not an array");
    }

    if (!value.every((emoji) => isCustomEmoji(emoji))) {
        throw new Error("Custom emoji response has invalid items");
    }

    return value;
}

function parseDeleteEmojiErrorResponse(errorText: string): string {
    const trimmedErrorText = errorText.trim();
    if (!trimmedErrorText) {
        return "Failed to delete emoji";
    }

    try {
        const parsed = JSON.parse(trimmedErrorText) as {
            error?: unknown;
            message?: unknown;
        };

        const parsedError =
            (typeof parsed.error === "string" ? parsed.error : undefined) ||
            (typeof parsed.message === "string" ? parsed.message : undefined);

        return parsedError || trimmedErrorText;
    } catch {
        return trimmedErrorText;
    }
}

function isEmojiStorageMutationEvent(
    events: string[],
    bucketId: string,
): boolean {
    if (events.length === 0) {
        return false;
    }

    const isCreateOrDeleteEvent = events.some(
        (eventName) =>
            eventName.endsWith(".create") || eventName.endsWith(".delete"),
    );
    if (!isCreateOrDeleteEvent) {
        return false;
    }

    return events.some(
        (eventName) =>
            eventName.startsWith(`buckets.${bucketId}.files.`) ||
            eventName.startsWith("buckets.*.files."),
    );
}

// Helper to get emojis from localStorage (for offline cache)
function getStoredEmojis(): CustomEmoji[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const stored = localStorage.getItem(EMOJIS_STORAGE_KEY);
        if (!stored) {
            return [];
        }

        const parsedStoredValue = JSON.parse(stored) as unknown;
        return validateCustomEmojis(parsedStoredValue);
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
        if (process.env.NODE_ENV === "development") {
            logger.error(
                "Failed to store emojis:",
                error instanceof Error ? error : String(error),
            );
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
        const rawEmojis = (await response.json()) as unknown;
        const emojis = validateCustomEmojis(rawEmojis);
        // Cache in localStorage for offline access
        storeEmojis(emojis);
        return emojis;
    } catch (error) {
        if (process.env.NODE_ENV === "development") {
            logger.error(
                "Failed to fetch emojis from server:",
                error instanceof Error ? error : String(error),
            );
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

        let cancelled = false;
        let unsubscribe: (() => void) | undefined;

        // Dynamically import realtime pool to avoid SSR issues
        import("@/lib/realtime-pool")
            .then(async ({ getSharedRealtime, trackSubscription }) => {
                if (cancelled) {
                    return;
                }

                const bucketId =
                    process.env.NEXT_PUBLIC_APPWRITE_EMOJIS_BUCKET_ID;
                if (!bucketId) {
                    return;
                }

                const realtime = getSharedRealtime();

                // Subscribe to file events so create and delete changes invalidate caches.
                const channel = Channel.bucket(bucketId).file();
                const channelKey = channel.toString();
                let untrack: (() => void) | undefined;

                const handleStorageEvent = (
                    event: RealtimeResponseEvent<Record<string, unknown>>,
                ) => {
                    // Refetch when files in the configured emoji bucket are created/deleted.
                    if (isEmojiStorageMutationEvent(event.events, bucketId)) {
                        void queryClient.invalidateQueries({
                            queryKey: ["customEmojis"],
                        });
                    }
                };

                try {
                    const subscription = await realtime.subscribe(
                        channel,
                        handleStorageEvent,
                    );
                    if (cancelled) {
                        await closeSubscriptionSafely(subscription);
                        return;
                    }

                    untrack = trackSubscription(channelKey);

                    unsubscribe = () => {
                        untrack?.();
                        void closeSubscriptionSafely(subscription);
                    };
                } catch (error) {
                    if (!cancelled) {
                        logger.error(
                            "Failed to subscribe to custom emoji realtime updates",
                            error instanceof Error ? error : String(error),
                            {
                                cancelled,
                                channelKey,
                                step: "realtime.subscribe",
                            },
                        );
                    }
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    logger.error(
                        "Failed to import realtime pool for custom emojis",
                        error instanceof Error ? error : String(error),
                        {
                            cancelled,
                            step: "import_realtime_pool",
                        },
                    );
                }
            });

        return () => {
            cancelled = true;
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
            queryClient.setQueryData<CustomEmoji[]>(
                ["customEmojis"],
                (old = []) => {
                    return [...old, tempEmoji];
                },
            );

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
                    throw new Error(
                        errorData.error || "Failed to upload emoji",
                    );
                }

                const result = (await response.json()) as {
                    fileId?: unknown;
                    name?: unknown;
                    url?: unknown;
                };

                if (
                    typeof result.fileId !== "string" ||
                    typeof result.url !== "string" ||
                    typeof result.name !== "string"
                ) {
                    throw new Error("Invalid upload response");
                }

                const uploadedEmoji: CustomEmoji = {
                    fileId: result.fileId,
                    url: result.url,
                    name: result.name,
                };

                // Replace temporary emoji with real one
                queryClient.setQueryData<CustomEmoji[]>(
                    ["customEmojis"],
                    (old = []) => {
                        return old.map((emoji) =>
                            emoji.fileId === tempEmojiId
                                ? uploadedEmoji
                                : emoji,
                        );
                    },
                );

                // Trigger full refetch to sync with server (in background)
                void queryClient.invalidateQueries({
                    queryKey: ["customEmojis"],
                });
            } catch (error) {
                // Remove the optimistic emoji on error
                queryClient.setQueryData<CustomEmoji[]>(
                    ["customEmojis"],
                    (old = []) => {
                        return old.filter(
                            (emoji) => emoji.fileId !== tempEmojiId,
                        );
                    },
                );
                throw error;
            } finally {
                setUploading(false);
                // Clean up object URL to avoid memory leaks
                URL.revokeObjectURL(tempEmoji.url);
            }
        },
        [queryClient],
    );

    // Delete a custom emoji
    const deleteEmoji = useCallback(
        async (fileId: string): Promise<void> => {
            // Store the emoji being deleted for rollback on error
            const previousEmojis = queryClient.getQueryData<CustomEmoji[]>([
                "customEmojis",
            ]);

            // Optimistically remove the emoji from UI
            queryClient.setQueryData<CustomEmoji[]>(
                ["customEmojis"],
                (old = []) => {
                    return old.filter((emoji) => emoji.fileId !== fileId);
                },
            );

            try {
                const encodedFileId = encodeURIComponent(fileId);
                const response = await fetch(
                    `/api/upload-emoji?fileId=${encodedFileId}`,
                    {
                        method: "DELETE",
                    },
                );

                if (!response.ok) {
                    const errorText = await response
                        .text()
                        .then((text) => text)
                        .catch(() => "");
                    throw new Error(
                        parseDeleteEmojiErrorResponse(errorText),
                    );
                }

                // Trigger full refetch to sync with server (in background)
                void queryClient.invalidateQueries({
                    queryKey: ["customEmojis"],
                });
            } catch (error) {
                // Rollback on error
                if (previousEmojis) {
                    queryClient.setQueryData(["customEmojis"], previousEmojis);
                }

                if (process.env.NODE_ENV === "development") {
                    logger.error(
                        "Failed to delete emoji:",
                        error instanceof Error ? error : String(error),
                    );
                }
                throw error;
            }
        },
        [queryClient],
    );

    return {
        customEmojis,
        isLoading,
        uploading,
        uploadEmoji,
        deleteEmoji,
    };
}
