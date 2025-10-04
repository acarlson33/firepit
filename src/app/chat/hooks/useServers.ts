"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createServer,
  deleteServer,
  joinServer,
} from "@/lib/appwrite-servers";
import type { Membership, Server } from "@/lib/types";

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
      return;
    }
    (async () => {
      try {
        const serverReq = fetch("/api/servers?limit=25")
          .then((res) => res.json())
          .then(
            (data) =>
              data as { servers: Server[]; nextCursor: string | null }
          );
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
          err instanceof Error ? err.message : "Failed to load servers"
        );
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
    return membership;
  }

  async function remove(serverId: string) {
    await deleteServer(serverId);
    setServers((prev) => prev.filter((s) => s.$id !== serverId));
    if (selectedServer === serverId) {
      setSelectedServer(null);
    }
  }

  return {
    servers,
    memberships,
    selectedServer,
    setSelectedServer,
    cursor,
    loading,
    loadMore,
    create,
    join,
    remove,
    membershipEnabled,
  };
}
