import { getEnvConfig } from "@/lib/appwrite-core";

function toNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function getAppwriteEndpointUrl(): URL | null {
    try {
        const env = getEnvConfig();
        const endpoint = env.endpoint.trim();
        if (endpoint.length === 0) {
            return null;
        }

        if (/^https?:\/\//i.test(endpoint)) {
            return new URL(endpoint);
        }

        return new URL(`https://${endpoint}`);
    } catch {
        return null;
    }
}

/**
 * Normalize Appwrite storage URLs to include the endpoint path prefix
 * (for example "/v1") when missing.
 */
export function normalizeAppwriteStorageUrl(
    rawUrl: string | undefined,
): string | undefined {
    const value = toNonEmptyString(rawUrl);
    if (!value) {
        return undefined;
    }

    const endpointUrl = getAppwriteEndpointUrl();
    if (!endpointUrl) {
        return value;
    }

    const endpointPrefix = endpointUrl.pathname.replace(/\/$/, "");

    try {
        const normalized = new URL(value, endpointUrl.origin);

        if (normalized.hostname !== endpointUrl.hostname) {
            return value;
        }

        if (
            endpointPrefix.length > 0 &&
            normalized.pathname.startsWith("/storage/")
        ) {
            normalized.pathname = `${endpointPrefix}${normalized.pathname}`;
        }

        return normalized.toString();
    } catch {
        return value;
    }
}

/**
 * Resolve an image URL for a message.
 * Prefer persisted imageUrl, but fall back to building a view URL from imageFileId.
 */
export function resolveMessageImageUrl(params: {
    imageFileId?: unknown;
    imageUrl?: unknown;
}): string | undefined {
    const persistedImageUrl = normalizeAppwriteStorageUrl(
        toNonEmptyString(params.imageUrl),
    );
    if (persistedImageUrl) {
        return persistedImageUrl;
    }

    const imageFileId = toNonEmptyString(params.imageFileId);
    if (!imageFileId) {
        return undefined;
    }

    try {
        const env = getEnvConfig();
        const endpoint = env.endpoint.replace(/\/$/, "");
        const bucketId = encodeURIComponent(env.buckets.images);
        const fileId = encodeURIComponent(imageFileId);
        const projectId = encodeURIComponent(env.project);

        return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
    } catch {
        return undefined;
    }
}
