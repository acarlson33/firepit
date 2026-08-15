import { parseJsonResponse } from "@/lib/parse-json-response";
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
 * Lists inbox.
 * @returns {Promise<InboxListResponse>} The return value.
 */
export async function listInbox(): Promise<InboxListResponse> {
    const response = await fetch("/api/inbox");
    return parseJsonResponse<InboxListResponse>(response, "Failed to load inbox");
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

    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    const response = await fetch(`/api/inbox${suffix}`);
    return parseJsonResponse<InboxListResponse>(
        response,
        "Failed to load inbox",
    );
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

    await parseJsonResponse(response, "Failed to update inbox items");
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

    await parseJsonResponse(response, "Failed to mark inbox context read");
}

const SCOPE_TO_CONTEXT_KINDS: Record<InboxScope, InboxContextKind[]> = {
    all: ["channel", "conversation"],
    direct: ["conversation"],
    server: ["channel"],
};

/**
 * Marks all inbox items in a scope as read.
 *
 * @param {InboxScope} scope - The scope: "all", "direct" (DMs), or "server" (channels).
 * @returns {Promise<void>} The return value.
 */
export async function markInboxScopeRead(scope: InboxScope): Promise<void> {
    const contextKinds = SCOPE_TO_CONTEXT_KINDS[scope];

    const promises = contextKinds.map((contextKind) =>
        markInboxContextRead({ contextKind }),
    );

    const results = await Promise.allSettled(promises);
    const failures: string[] = [];

    for (const result of results) {
        if (result.status === "rejected") {
            const reason = result.reason;
            failures.push(
                reason instanceof Error ? reason.message : String(reason),
            );
        }
    }

    if (failures.length > 0) {
        throw new Error(
            `Failed to mark some inbox context kinds as read: ${failures.join("; ")}`,
        );
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

    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    const response = await fetch(`/api/inbox/digest${suffix}`);
    return parseJsonResponse<InboxDigestResponse>(
        response,
        "Failed to load inbox digest",
    );
}
