import { parseJsonResponse } from "@/lib/parse-json-response";
import type { ThreadReadContextType } from "@/lib/thread-read-states";

type ThreadReadResponse = {
    reads?: Record<string, string>;
};

/**
 * Lists thread reads.
 *
 * @param {ThreadReadContextType} contextType - The context type value.
 * @param {string} contextId - The context id value.
 * @returns {Promise<Record<string, string>>} The return value.
 */
export async function listThreadReads(
    contextType: ThreadReadContextType,
    contextId: string,
) {
    const params = new URLSearchParams({ contextId, contextKind: contextType });
    const response = await fetch(`/api/thread-reads?${params.toString()}`);
    const data = await parseJsonResponse<ThreadReadResponse>(
        response,
        "Failed to sync thread reads",
    );

    return data.reads ?? {};
}

/**
 * Handles persist thread reads.
 *
 * @param {{ contextId: string; contextType: ThreadReadContextType; reads: Record<string, string>; }} params - The params value.
 * @returns {Promise<Record<string, string>>} The return value.
 */
export async function persistThreadReads(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    reads: Record<string, string>;
}) {
    const { contextType, ...rest } = params;
    const response = await fetch("/api/thread-reads", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...rest, contextKind: contextType }),
    });
    const data = await parseJsonResponse<ThreadReadResponse>(
        response,
        "Failed to sync thread reads",
    );

    return data.reads ?? {};
}
