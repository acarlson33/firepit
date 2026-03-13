import type {
    InboxContextKind,
    InboxDigestResponse,
    InboxListResponse,
    InboxItemKind,
} from "@/lib/types";

export type InboxScope = "all" | "direct" | "server";

type MarkInboxItemsReadInput = {
    itemIds: string[];
};

/**
 * Parses inbox response.
 *
 * @param {Response} response - The response value.
 * @returns {Promise<InboxListResponse>} The return value.
 */
async function parseInboxResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to load inbox");
    }

    return (await response.json()) as InboxListResponse;
}

/**
 * Parses inbox digest response.
 *
 * @param {Response} response - The response value.
 * @returns {Promise<InboxDigestResponse>} The return value.
 */
async function parseInboxDigestResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to load inbox digest");
    }

    return (await response.json()) as InboxDigestResponse;
}

/**
 * Lists inbox.
 * @returns {Promise<InboxListResponse>} The return value.
 */
export async function listInbox(): Promise<InboxListResponse> {
    const response = await fetch("/api/inbox");
    return parseInboxResponse(response);
}

/**
 * Lists inbox with filters.
 *
 * @param {{ contextId?: string | undefined; contextKind?: any; kinds?: InboxItemKind[] | undefined; limit?: number | undefined; scope?: InboxScope | undefined; } | undefined} params - The params value, if provided.
 * @returns {Promise<InboxListResponse>} The return value.
 */
export async function listInboxWithFilters(params?: {
    contextId?: string;
    contextKind?: InboxContextKind;
    kinds?: InboxItemKind[];
    limit?: number;
    scope?: InboxScope;
}): Promise<InboxListResponse> {
    const query = new URLSearchParams();
    if (params?.contextId) {
        query.set("contextId", params.contextId);
    }
    if (params?.contextKind) {
        query.set("contextKind", params.contextKind);
    }
    if (params?.kinds && params.kinds.length > 0) {
        for (const kind of params.kinds) {
            query.append("kind", kind);
        }
    }
    if (typeof params?.limit === "number") {
        query.set("limit", String(params.limit));
    }
    if (params?.scope) {
        query.set("scope", params.scope);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await fetch(`/api/inbox${suffix}`);
    return parseInboxResponse(response);
}

/**
 * Marks inbox items read.
 *
 * @param {{ itemIds: string[]; }} params - The params value.
 * @returns {Promise<void>} The return value.
 */
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

/**
 * Marks inbox context read.
 *
 * @param {{ contextId?: string | undefined; contextKind?: any; } | undefined} params - The params value, if provided.
 * @returns {Promise<void>} The return value.
 */
export async function markInboxContextRead(params?: {
    contextId?: string;
    contextKind?: InboxContextKind;
}) {
    const response = await fetch("/api/inbox", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            action: "mark-all-read",
            contextId: params?.contextId,
            contextKind: params?.contextKind,
        }),
    });

    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to mark inbox context read");
    }
}

/**
 * Lists inbox digest.
 *
 * @param {{ contextId?: string | undefined; contextKind?: 'channel' | 'conversation' | undefined; limit?: number | undefined; } | undefined} params - The params value, if provided.
 * @returns {Promise<InboxDigestResponse>} The return value.
 */
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
