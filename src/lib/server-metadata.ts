import { getEnvConfig } from "@/lib/appwrite-core";
import type { Server } from "@/lib/types";

const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function normalizeServerVisibility(value: unknown): boolean {
    return value !== false;
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
    const endpoint = env.endpoint.replace(/\/$/, "");
    const bucketId = encodeURIComponent(env.buckets.images);
    const projectId = encodeURIComponent(env.project);
    const encodedFileId = encodeURIComponent(fileId);

    return `${endpoint}/storage/buckets/${bucketId}/files/${encodedFileId}/view?project=${projectId}`;
}

export function mapServerDocument(
    document: Record<string, unknown>,
    memberCount: number,
): Server {
    const iconFileId = normalizeServerFileId(document.iconFileId);
    const bannerFileId = normalizeServerFileId(document.bannerFileId);

    return {
        $id: String(document.$id ?? ""),
        name: String(document.name ?? ""),
        $createdAt: String(document.$createdAt ?? ""),
        ownerId: String(document.ownerId ?? ""),
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
