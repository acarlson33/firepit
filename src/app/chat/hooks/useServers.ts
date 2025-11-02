"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createServer,
  deleteServer,
  joinServer,
} from "@/lib/appwrite-servers";
import type { Membership, Server } from "@/lib/types";
import { apiCache, CACHE_TTL } from "@/lib/cache-utils";

type UseServersOptions = {
  userId: string | null;
  membershipEnabled: boolean;
};

export function useServers({ userId, membershipEnabled }: UseServersOptions) {
  const [servers, setServers] = useState<Server[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const filterAllowedServers = useCallback(
    (all: Server[], mems: Membership[]): Server[] => {
      if (!membershipEnabled) {
        return all;
      }
      if (!mems.length) {
        return [];
      }
      return all.filter((s) => mems.some((m) => m.serverId === s.$id));
    },
    [membershipEnabled]
  );

  // initial load
  useEffect(() => {
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    (async () => {
      try {
        setInitialLoading(true);
        
        // Use SWR (stale-while-revalidate) to serve cached data instantly while revalidating
        const serverReq = apiCache.swr(
          `servers:initial:${userId}`,
          () => fetch("/api/servers?limit=25")
            .then((res) => res.json())
            .then((data) => data as { servers: Server[]; nextCursor: string | null }),
          CACHE_TTL.SERVERS
        );
        
        const membershipReq = membershipEnabled
          ? apiCache.swr(
              `memberships:${userId}`,
              () => fetch("/api/memberships")
                .then((res) => res.json())
                .then((data) => data.memberships as Membership[]),
              CACHE_TTL.MEMBERSHIPS
            )
          : Promise.resolve<Membership[]>([]);
        
        const [{ servers: first, nextCursor }, mems] = await Promise.all([
          serverReq,
          membershipReq,
        ]);
        setCursor(nextCursor);
        setMemberships(mems);
        setServers(filterAllowedServers(first, mems));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load servers"
        );
      } finally {
        setInitialLoading(false);
      }
    })().catch(() => {
      /* error already surfaced */
    });
  }, [userId, membershipEnabled, filterAllowedServers]);

  // auto-select single server
  useEffect(() => {
    if (servers.length === 1 && !selectedServer) {
      setSelectedServer(servers[0].$id);
    }
  }, [servers, selectedServer]);

  async function loadMore() {
    if (!cursor || loading) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/servers?limit=25&cursor=${cursor}`);
      const data = (await response.json()) as {
        servers: Server[];
        nextCursor: string | null;
      };
      setCursor(data.nextCursor);
      const merged = [...servers, ...data.servers];
      setServers(filterAllowedServers(merged, memberships));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load more servers"
      );
    } finally {
      setLoading(false);
    }
  }

  async function create(name: string, _ownerId: string) {
    const server = await createServer(name);
    setServers((prev) => [...prev, server]);
    setSelectedServer(server.$id);
    // Invalidate cache
    if (userId) {
      apiCache.clear(`servers:initial:${userId}`);
    }
    return server;
  }

  async function join(id: string, uid: string) {
    const membership = await joinServer(id, uid);
    if (!membership) {
      toast.error("Membership collection not configured");
      return null;
    }
    setMemberships((prev) => [...prev, membership]);
    setServers((prev) =>
      filterAllowedServers(prev, [...memberships, membership])
    );
    setSelectedServer(id);
    // Invalidate cache
    apiCache.clear(`memberships:${uid}`);
    return membership;
  }

  async function remove(serverId: string) {
    await deleteServer(serverId);
    setServers((prev) => prev.filter((s) => s.$id !== serverId));
    if (selectedServer === serverId) {
      setSelectedServer(null);
    }
    // Invalidate cache
    if (userId) {
      apiCache.clear(`servers:initial:${userId}`);
    }
  }

  return {
    servers,
    memberships,
    selectedServer,
    setSelectedServer,
    cursor,
    loading,
    initialLoading,
    loadMore,
    create,
    join,
    remove,
    membershipEnabled,
  };
}
