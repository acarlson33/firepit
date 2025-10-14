"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createChannel,
  deleteChannel,
} from "@/lib/appwrite-servers";
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

  useEffect(() => {
    if (!selectedServer) {
      setChannels([]);
      setCursor(null);
      return;
    }
    (async () => {
      try {
        // Use SWR pattern for instant cached data (Performance Optimization #3)
        const data = await apiCache.swr(
          `channels:${selectedServer}:initial`,
          () => fetch(`/api/channels?serverId=${selectedServer}&limit=50`)
            .then((res) => res.json())
            .then((d) => d as { channels: Channel[]; nextCursor: string | null }),
          CACHE_TTL.CHANNELS,
          // Update state when fresh data arrives
          (freshData) => {
            setChannels(freshData.channels);
            setCursor(freshData.nextCursor);
          }
        );
        setChannels(data.channels);
        setCursor(data.nextCursor);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load channels"
        );
      }
    })().catch(() => {
      /* ignored initial channel load error already surfaced */
    });
  }, [selectedServer]);

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
        `/api/channels?serverId=${selectedServer}&limit=50&cursor=${cursor}`
      );
      const data = (await response.json()) as {
        channels: Channel[];
        nextCursor: string | null;
      };
      setCursor(data.nextCursor);
      setChannels((prev) => [...prev, ...data.channels]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load more channels"
      );
    } finally {
      setLoading(false);
    }
  }

  async function create(name: string) {
    if (!userId) {
      return null;
    }
    if (!selectedServer) {
      return null;
    }
    const channel = await createChannel(selectedServer, name, userId);
    setChannels((prev) => [...prev, channel]);
    // Invalidate cache
    apiCache.clear(`channels:${selectedServer}:initial`);
    return channel;
  }

  async function remove(channel: Channel) {
    // updated signature: deleteChannel(channelId)
    await deleteChannel(channel.$id);
    setChannels((prev) => prev.filter((c) => c.$id !== channel.$id));
    // Invalidate cache
    if (selectedServer) {
      apiCache.clear(`channels:${selectedServer}:initial`);
    }
  }

  const isOwner = useCallback(
    (serverId: string) => {
      const server = servers.find((s) => s.$id === serverId);
      return server ? server.ownerId === userId : false;
    },
    [servers, userId]
  );

  return { channels, cursor, loading, loadMore, create, remove, isOwner };
}
