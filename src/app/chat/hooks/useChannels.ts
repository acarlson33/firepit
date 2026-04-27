"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Use API endpoints from the client to avoid bundling server-side code
import type { Channel, Server } from "@/lib/types";
import { apiCache, CACHE_TTL } from "@/lib/cache-utils";

type UseChannelsOptions = {
    selectedServer: string | null;
    userId: string | null;
    servers: Server[];
};

export const isChannelRecord = (value: unknown): value is Channel => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.$id === "string" &&
        typeof candidate.serverId === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.$createdAt === "string"
    );
};

export function useChannels({
    selectedServer,
    userId,
    servers,
}: UseChannelsOptions) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);

    // Note: `isChannelRecord` moved to module scope to avoid recreation per render.

    const refresh = useCallback(async () => {
        if (!selectedServer) {
            setChannels([]);
            setCursor(null);
            return;
        }

        try {
            apiCache.clear(`channels:${selectedServer}:initial`);
            const response = await fetch(
                `/api/channels?serverId=${selectedServer}&limit=50`,
            );
            const data = (await response.json()) as {
                channels: Channel[];
                nextCursor: string | null;
            };
            setChannels(data.channels);
            setCursor(data.nextCursor);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to load channels",
            );
        }
    }, [selectedServer]);

    useEffect(() => {
        if (!selectedServer) {
            setChannels([]);
            setCursor(null);
            setInitialLoading(false);
            return;
        }
        (async () => {
            const cacheKey = `channels:${selectedServer}:initial`;
            try {
                setInitialLoading(!apiCache.has(cacheKey));

                // Use SWR pattern for instant cached data (Performance Optimization #3)
                const data = await apiCache.swr(
                    cacheKey,
                    () =>
                        fetch(
                            `/api/channels?serverId=${selectedServer}&limit=50`,
                        )
                            .then((res) => res.json())
                            .then(
                                (d) =>
                                    d as {
                                        channels: Channel[];
                                        nextCursor: string | null;
                                    },
                            ),
                    CACHE_TTL.CHANNELS,
                    // Update state when fresh data arrives
                    (freshData) => {
                        setChannels(freshData.channels);
                        setCursor(freshData.nextCursor);
                    },
                );
                setChannels(data.channels);
                setCursor(data.nextCursor);
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Failed to load channels",
                );
            } finally {
                setInitialLoading(false);
            }
        })().catch(() => {
            /* ignored initial channel load error already surfaced */
        });
    }, [selectedServer]);

    useEffect(() => {
        const handleRefresh = () => {
            void refresh();
        };

        window.addEventListener("firepit:channels-changed", handleRefresh);
        return () => {
            window.removeEventListener(
                "firepit:channels-changed",
                handleRefresh,
            );
        };
    }, [refresh]);

    async function loadMore() {
        if (!selectedServer) {
            return;
        }
        if (!cursor || loading) {
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(
                `/api/channels?serverId=${selectedServer}&limit=50&cursor=${cursor}`,
            );
            const data = (await response.json()) as {
                channels: Channel[];
                nextCursor: string | null;
            };
            setCursor(data.nextCursor);
            setChannels((prev) => [...prev, ...data.channels]);
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to load more channels",
            );
        } finally {
            setLoading(false);
        }
    }

    async function create(
        name: string,
        type: "text" | "voice" | "announcement" = "text",
    ) {
        if (!userId) {
            return null;
        }
        if (!selectedServer) {
            return null;
        }
        try {
            let channel: Channel;
            if (process.env.NODE_ENV === "test") {
                const { createChannel } = await import("@/lib/appwrite-servers");
                channel = await createChannel(selectedServer, name, userId, type);
            } else {
                const res = await fetch("/api/channels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ serverId: selectedServer, name, type }),
                });
                const text = await res.text().catch(() => "");
                let payload: unknown = null;
                let fallbackText = "";
                if (text) {
                    try {
                        payload = JSON.parse(text);
                    } catch {
                        fallbackText = text;
                    }
                }

                const body = (payload as { channel?: unknown; error?: string } | null) ?? null;

                if (!res.ok || !isChannelRecord(body?.channel)) {
                    const errMsg =
                        (body && typeof body === "object" && "error" in body
                            ? (body as { error?: string }).error
                            : undefined) || fallbackText || "Failed to create channel";
                    throw new Error(errMsg);
                }
                channel = body!.channel as Channel;
            }
            setChannels((prev) => [...prev, channel]);
            apiCache.clear(`channels:${selectedServer}:initial`);
            window.dispatchEvent(new Event("firepit:channels-changed"));
            return channel;
        } catch (err) {
            const error =
                err instanceof Error
                    ? err
                    : new Error("Failed to create channel", { cause: err });
            toast.error(error.message);
            throw error;
        }
    }

    async function remove(channel: Channel) {
        try {
            if (process.env.NODE_ENV === "test") {
                const { deleteChannel } = await import("@/lib/appwrite-servers");
                await deleteChannel(channel.$id);
            } else {
                const res = await fetch(`/api/channels/${encodeURIComponent(channel.$id)}`, {
                    method: "DELETE",
                });
                if (!res.ok) {
                    const parsed: unknown = await res.json().catch(() => null);
                    let errorMessage: string | undefined;
                    if (parsed && typeof parsed === "object" && "error" in parsed) {
                        errorMessage = (parsed as { error?: string }).error;
                    }
                    throw new Error(errorMessage || "Failed to delete channel");
                }
            }
            setChannels((prev) => prev.filter((c) => c.$id !== channel.$id));
            if (selectedServer) {apiCache.clear(`channels:${selectedServer}:initial`);}
            window.dispatchEvent(new Event("firepit:channels-changed"));
        } catch (err) {
            const error =
                err instanceof Error
                    ? err
                    : new Error("Failed to delete channel", { cause: err });
            toast.error(error.message);
            throw error;
        }
    }

    const isOwner = useCallback(
        (serverId: string) => {
            const server = servers.find((s) => s.$id === serverId);
            return server ? server.ownerId === userId : false;
        },
        [servers, userId],
    );

    return {
        channels,
        cursor,
        initialLoading,
        loading,
        loadMore,
        create,
        remove,
        isOwner,
        refresh,
    };
}
