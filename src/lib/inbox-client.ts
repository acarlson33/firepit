import type { InboxDigestResponse, InboxListResponse } from "@/lib/types";

type MarkInboxItemsReadInput = {
    itemIds: string[];
};

async function parseInboxResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to load inbox");
    }

    return (await response.json()) as InboxListResponse;
}

async function parseInboxDigestResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to load inbox digest");
    }

    return (await response.json()) as InboxDigestResponse;
}

export async function listInbox(): Promise<InboxListResponse> {
    const response = await fetch("/api/inbox");
    return parseInboxResponse(response);
}

export async function markInboxItemsRead({ itemIds }: MarkInboxItemsReadInput) {
    if (itemIds.length === 0) {
        return;
    }

    const response = await fetch("/api/inbox", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemIds }),
    });

    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to update inbox items");
    }
}

export async function listInboxDigest(params?: {
    contextId?: string;
    contextKind?: "channel" | "conversation";
    limit?: number;
}): Promise<InboxDigestResponse> {
    const query = new URLSearchParams();
    if (params?.contextId) {
        query.set("contextId", params.contextId);
    }
    if (params?.contextKind) {
        query.set("contextKind", params.contextKind);
    }
    if (typeof params?.limit === "number") {
        query.set("limit", String(params.limit));
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await fetch(`/api/inbox/digest${suffix}`);
    return parseInboxDigestResponse(response);
}
