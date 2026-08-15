/**
 * Parses a JSON API response, throwing a fallback error when the request
 * failed and no server-provided error message is available.
 */
export async function parseJsonResponse<T>(
    response: Response,
    fallbackMessage: string,
): Promise<T> {
    if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(data?.error || fallbackMessage);
    }

    return response.json() as Promise<T>;
}
