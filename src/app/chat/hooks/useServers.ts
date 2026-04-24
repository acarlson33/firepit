"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Use server API endpoints from the client to avoid bundling server-only libs
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
    try {
      const res = await fetch("/api/servers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error || "Failed to create server");
      }
      const server = payload.server as any;
      setServers((prev) => [...prev, server]);
      setSelectedServer(server.$id);
      if (userId) apiCache.clear(`servers:initial:${userId}`);
      return server;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create server");
      throw err;
    }
  }

  async function join(id: string, uid: string) {
    try {
      const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: id }),
      });
      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload?.error || "Failed to join server");
      }
      const membership = payload as any;
      setMemberships((prev) => [...prev, membership]);
      setServers((prev) => filterAllowedServers(prev, [...memberships, membership]));
      setSelectedServer(id);
      apiCache.clear(`memberships:${uid}`);
      return membership;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join server");
      return null;
    }
  }

  async function remove(serverId: string) {
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to delete server");
      }
      setServers((prev) => prev.filter((s) => s.$id !== serverId));
      if (selectedServer === serverId) setSelectedServer(null);
      if (userId) apiCache.clear(`servers:initial:${userId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete server");
      throw err;
    }
  }

  async function refresh() {
    if (!userId) {
      return;
    }
    setLoading(true);
    try {
      // Clear cache and reload
      apiCache.clear(`servers:initial:${userId}`);
      if (membershipEnabled) {
        apiCache.clear(`memberships:${userId}`);
      }
      
      const serverReq = fetch("/api/servers?limit=25")
        .then((res) => res.json())
        .then((data) => data as { servers: Server[]; nextCursor: string | null });
      
      const membershipReq = membershipEnabled
        ? fetch("/api/memberships")
            .then((res) => res.json())
            .then((data) => data.memberships as Membership[])
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
        err instanceof Error ? err.message : "Failed to refresh servers"
      );
    } finally {
      setLoading(false);
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
    refresh,
    membershipEnabled,
  };
}
