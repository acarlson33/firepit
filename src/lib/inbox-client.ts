import type { InboxListResponse } from "@/lib/types";

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
