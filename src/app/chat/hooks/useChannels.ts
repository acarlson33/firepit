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

export function useChannels({
    selectedServer,
    userId,
    servers,
}: UseChannelsOptions) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);

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
            const res = await fetch("/api/channels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serverId: selectedServer, name, type }),
            });
            const payload = await res.json();
            if (!res.ok || !payload.channel) {
                throw new Error(payload?.error || "Failed to create channel");
            }
            const channel = payload.channel as Channel;
            setChannels((prev) => [...prev, channel]);
            apiCache.clear(`channels:${selectedServer}:initial`);
            return channel;
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create channel");
            return null;
        }
    }

    async function remove(channel: Channel) {
        try {
            const res = await fetch(`/api/channels/${encodeURIComponent(channel.$id)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || "Failed to delete channel");
            }
            setChannels((prev) => prev.filter((c) => c.$id !== channel.$id));
            if (selectedServer) apiCache.clear(`channels:${selectedServer}:initial`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete channel");
            throw err;
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
