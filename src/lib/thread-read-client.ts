import type { ThreadReadContextType } from "@/lib/thread-read-states";

type ThreadReadResponse = {
    reads?: Record<string, string>;
};

/**
 * Parses thread read response.
 *
 * @param {Response} response - The response value.
 * @returns {Promise<ThreadReadResponse>} The return value.
 */
async function parseThreadReadResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to sync thread reads");
    }

    return (await response.json()) as ThreadReadResponse;
}

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
    const data = await parseThreadReadResponse(response);

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
    const data = await parseThreadReadResponse(response);

    return data.reads ?? {};
}
