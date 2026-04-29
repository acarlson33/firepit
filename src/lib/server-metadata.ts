import { getEnvConfig } from "@/lib/appwrite-core";
import type { Server } from "@/lib/types";

const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TRAILING_SLASH_PATTERN = /\/+$/;

export function normalizeServerVisibility(value: unknown): boolean {
    // Treat missing/legacy visibility as private. Only an explicit `true`
    // value marks a server as public.
    return value === true;
}

function normalizeServerDefaultOnSignup(value: unknown): boolean {
    return value === true;
}

export function normalizeServerDescription(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function normalizeServerFileId(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmedValue = value.trim();
    if (!APPWRITE_ID_PATTERN.test(trimmedValue)) {
        return undefined;
    }

    return trimmedValue;
}

function buildServerImageUrl(fileId: string): string {
    const env = getEnvConfig();
    const endpoint = env.endpoint.replace(TRAILING_SLASH_PATTERN, "");
    const bucketId = encodeURIComponent(env.buckets.images);
    const projectId = encodeURIComponent(env.project);
    const encodedFileId = encodeURIComponent(fileId);

    return `${endpoint}/storage/buckets/${bucketId}/files/${encodedFileId}/view?project=${projectId}`;
}

export function mapServerDocument(
    document: Record<string, unknown>,
    memberCount: number,
): Server {
    // Validate required identity fields to avoid producing invalid Server objects
    if (
        typeof document.$id !== "string" || !document.$id.trim() ||
        typeof document.name !== "string" || !document.name.trim() ||
        typeof document.ownerId !== "string" || !document.ownerId.trim()
    ) {
        throw new Error("Invalid server document: missing required identity fields");
    }

    const iconFileId = normalizeServerFileId(document.iconFileId);
    const bannerFileId = normalizeServerFileId(document.bannerFileId);
    const serverId = document.$id.trim();
    const serverName = document.name.trim();
    const ownerId = document.ownerId.trim();

    return {
        $id: serverId,
        name: serverName,
        $createdAt: String(document.$createdAt ?? ""),
        ownerId,
        memberCount,
        description: normalizeServerDescription(document.description),
        iconFileId,
        iconUrl: iconFileId ? buildServerImageUrl(iconFileId) : undefined,
        bannerFileId,
        bannerUrl: bannerFileId ? buildServerImageUrl(bannerFileId) : undefined,
        isPublic: normalizeServerVisibility(document.isPublic),
        defaultOnSignup: normalizeServerDefaultOnSignup(
            document.defaultOnSignup,
        ),
    } satisfies Server;
}
