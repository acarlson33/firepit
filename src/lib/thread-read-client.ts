import type { ThreadReadContextType } from "@/lib/thread-read-states";

type ThreadReadResponse = {
    reads?: Record<string, string>;
};

async function parseThreadReadResponse(response: Response) {
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(error?.error || "Failed to sync thread reads");
    }

    return (await response.json()) as ThreadReadResponse;
}

export async function listThreadReads(
    contextType: ThreadReadContextType,
    contextId: string,
) {
    const params = new URLSearchParams({ contextId, contextType });
    const response = await fetch(`/api/thread-reads?${params.toString()}`);
    const data = await parseThreadReadResponse(response);

    return data.reads ?? {};
}

export async function persistThreadReads(params: {
    contextId: string;
    contextType: ThreadReadContextType;
    reads: Record<string, string>;
}) {
    const response = await fetch("/api/thread-reads", {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    });
    const data = await parseThreadReadResponse(response);

    return data.reads ?? {};
}
