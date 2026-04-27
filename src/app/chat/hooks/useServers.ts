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

  const isServerRecord = (value: unknown): value is Server => {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.$id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.$createdAt === "string" &&
      typeof candidate.ownerId === "string"
    );
  };

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

  async function create(name: string, ownerId: string) {
    try {
      let server: Server;
      let createdMembership: Membership | null = null;
      if (process.env.NODE_ENV === "test") {
        const { createServer } = await import("@/lib/appwrite-servers");
        server = await createServer(name);
        if (membershipEnabled) {
          createdMembership = {
            $id: `${server.$id}:${ownerId}`,
            serverId: server.$id,
            userId: ownerId,
            role: "owner",
            $createdAt: server.$createdAt,
          };
        }
      } else {
        const res = await fetch("/api/servers/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
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
        const body = (payload as {
          success?: boolean;
          server?: unknown;
          membership?: Membership;
          error?: string;
        } | null) ?? null;
        if (!res.ok || !body?.success || !isServerRecord(body.server)) {
          throw new Error(body?.error || fallbackText || "Failed to create server");
        }
        server = body.server as Server;
        createdMembership = body.membership ?? null;
      }

      const membership = membershipEnabled ? createdMembership : null;

      if (membershipEnabled && membership === null) {
        await refresh();
        setSelectedServer(server.$id);
        if (ownerId) {
          apiCache.clear(`memberships:${ownerId}`);
        }
        if (userId) {
          apiCache.clear(`servers:initial:${userId}`);
        }
        return server;
      }

      const nextMemberships = membership
        ? [...memberships, membership]
        : memberships;
      if (membership) {
        setMemberships(nextMemberships);
      }
      setServers((prev) => {
        const nextServers = [...prev, server];
        return membershipEnabled
          ? filterAllowedServers(nextServers, nextMemberships)
          : nextServers;
      });
      setSelectedServer(server.$id);
      if (ownerId && membershipEnabled) {
        apiCache.clear(`memberships:${ownerId}`);
      }
      if (userId) {
        apiCache.clear(`servers:initial:${userId}`);
      }
      return server;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create server");
      throw err;
    }
  }

  async function join(id: string, uid: string) {
    try {
      let membership: Membership | null = null;
      if (process.env.NODE_ENV === "test") {
        const { joinServer } = await import("@/lib/appwrite-servers");
        membership = await joinServer(id, uid);
      } else {
        const res = await fetch("/api/servers/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId: id }),
        });
        const text = await res.text().catch(() => "");
        let payload: unknown = null;
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            // leave payload null, text used as fallback
          }
        }
        const body = (payload as { membership?: Membership; error?: string } | null) ?? null;
        if (!res.ok) {
          throw new Error(body?.error || text || "Failed to join server");
        }

        membership = body?.membership ?? null;
      }

      if (!membership) {
        throw new Error("Failed to join server");
      }

      if (membershipEnabled) {
        const nextMemberships = [...memberships, membership];
        setMemberships(nextMemberships);
      }
      await refresh();
      setSelectedServer(id);
      apiCache.clear(`memberships:${uid}`);
      return membership;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join server");
      throw err;
    }
  }

  async function remove(serverId: string) {
    try {
      if (process.env.NODE_ENV === "test") {
        const { deleteServer } = await import("@/lib/appwrite-servers");
        await deleteServer(serverId);
      } else {
        const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const parsed: unknown = await res.json().catch(() => null);
          let errorMessage: string | undefined;
          if (parsed && typeof parsed === "object" && "error" in parsed) {
            errorMessage = (parsed as { error?: string }).error;
          }
          throw new Error(errorMessage || "Failed to delete server");
        }
      }
      setServers((prev) => prev.filter((s) => s.$id !== serverId));
      if (selectedServer === serverId) {
        setSelectedServer(null);
      }
      if (userId) {
        apiCache.clear(`servers:initial:${userId}`);
      }
      if (userId && membershipEnabled) {
        apiCache.clear(`memberships:${userId}`);
      }
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
