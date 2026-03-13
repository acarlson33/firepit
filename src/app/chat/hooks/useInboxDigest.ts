"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listInboxDigest } from "@/lib/inbox-client";
import type { InboxContextKind, InboxDigestResponse } from "@/lib/types";

const EMPTY_DIGEST: InboxDigestResponse = {
    contractVersion: "thread_v1",
    items: [],
    totalUnreadCount: 0,
};

function getInboxDigestQueryKey(params: {
    contextId?: string;
    contextKind?: InboxContextKind;
    limit?: number;
    userId: string | null;
}) {
    return [
        "inbox-digest",
        params.userId,
        params.contextKind ?? "all",
        params.contextId ?? "all",
        params.limit ?? "default",
    ] as const;
}

function formatInboxDigestError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (error) {
        return "Failed to load inbox digest";
    }

    return null;
}

export function useInboxDigest(params: {
    contextId?: string;
    contextKind?: InboxContextKind;
    enabled?: boolean;
    limit?: number;
    userId: string | null;
}) {
    const { contextId, contextKind, enabled = true, limit, userId } = params;
    const queryEnabled = Boolean(userId) && enabled;

    const query = useQuery({
        queryKey: getInboxDigestQueryKey({
            contextId,
            contextKind,
            limit,
            userId,
        }),
        queryFn: () =>
            listInboxDigest({
                contextId,
                contextKind,
                limit,
            }),
        enabled: queryEnabled,
        staleTime: 15_000,
        gcTime: 10 * 60 * 1000,
    });

    const data = query.data ?? EMPTY_DIGEST;

    const unreadByKind = useMemo(
        () =>
            data.items.reduce(
                (accumulator, item) => {
                    accumulator[item.kind] += item.unreadCount;
                    return accumulator;
                },
                { mention: 0, thread: 0 },
            ),
        [data.items],
    );

    return {
        contractVersion: data.contractVersion,
        contextId: data.contextId,
        contextKind: data.contextKind,
        error: formatInboxDigestError(query.error),
        items: data.items,
        loading: queryEnabled ? query.isLoading : false,
        refresh: query.refetch,
        totalUnreadCount: data.totalUnreadCount,
        unreadByKind,
    };
}
