import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "@/lib/firepit/http";

export type UserStatus = {
  userId: string;
  status: "online" | "away" | "busy" | "offline";
  customMessage?: string;
  lastSeenAt?: string;
};

/**
 * Fetches user statuses via /api/status/batch and polls every 10s to keep them fresh.
 * The hook is stable: it only re-fetches when the actual set of user IDs changes,
 * not on every parent render.
 */
export function useStatusSubscription(
  instanceUrl: string | null,
  accessToken: string | null,
  userIds: string[],
) {
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  // Stable JSON key — only changes when the actual ID set changes
  const idsKey = useMemo(
    () =>
      JSON.stringify(
        Array.from(new Set(userIds.filter((id) => id.length > 0))).sort(),
      ),
    [userIds],
  );

  const doFetch = useCallback(async () => {
    if (!instanceUrl || !accessToken) {
      setStatuses({});
      setLoading(false);
      return;
    }

    let normalizedIds: string[];
    try {
      normalizedIds = JSON.parse(idsKey);
    } catch {
      normalizedIds = [];
    }

    if (normalizedIds.length === 0) {
      setStatuses({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${instanceUrl}/api/status/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(accessToken),
        },
        body: JSON.stringify({ userIds: normalizedIds }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.statuses && !cancelledRef.current) {
          const statusMap: Record<string, UserStatus> = {};
          for (const [uid, raw] of Object.entries(data.statuses)) {
            const s = raw as {
              userId?: string;
              status?: string;
              customMessage?: string;
              lastSeenAt?: string;
            };
            statusMap[uid] = {
              userId: s.userId ?? uid,
              status: mapStatus(s.status),
              customMessage: s.customMessage,
              lastSeenAt: s.lastSeenAt,
            };
          }
          setStatuses(statusMap);
        }
      }
    } catch {
      // ignore
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [instanceUrl, accessToken, idsKey]);

  // Fetch on mount, ids change, or auth change
  useEffect(() => {
    cancelledRef.current = false;
    void doFetch();
    return () => {
      cancelledRef.current = true;
    };
  }, [doFetch]);

  // Stable polling interval — keyed on auth + ids, not on doFetch
  useEffect(() => {
    if (!instanceUrl || !accessToken) return;

    const tick = () => {
      if (!instanceUrl || !accessToken) return;
      let normalizedIds: string[];
      try {
        normalizedIds = JSON.parse(idsKey);
      } catch {
        return;
      }
      if (normalizedIds.length === 0) return;
      fetch(`${instanceUrl}/api/status/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(accessToken),
        },
        body: JSON.stringify({ userIds: normalizedIds }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.statuses || cancelledRef.current) return;
          const statusMap: Record<string, UserStatus> = {};
          for (const [uid, raw] of Object.entries(data.statuses)) {
            const s = raw as {
              userId?: string;
              status?: string;
              customMessage?: string;
              lastSeenAt?: string;
            };
            statusMap[uid] = {
              userId: s.userId ?? uid,
              status: mapStatus(s.status),
              customMessage: s.customMessage,
              lastSeenAt: s.lastSeenAt,
            };
          }
          setStatuses(statusMap);
        })
        .catch(() => {});
    };

    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [instanceUrl, accessToken, idsKey]);

  return { statuses, loading, refresh: doFetch };
}

function mapStatus(raw?: string): UserStatus["status"] {
  switch (raw) {
    case "online":
      return "online";
    case "away":
      return "away";
    case "busy":
      return "busy";
    default:
      return "offline";
  }
}
