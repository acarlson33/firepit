"use server";

import { revalidatePath } from "next/cache";
import { AppwriteException } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { requireAdmin } from "@/lib/auth-server";
import { getPresetFrameStorageFileId } from "@/lib/preset-frames";

const MAX_PRESET_FRAME_SIZE = 1 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_CREATE_ATTEMPTS = 3;

function toErrorDetails(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }

    if (typeof err === "string") {
        return err;
    }

    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

function getAppwriteErrorCode(err: unknown): number | null {
    if (!(err instanceof AppwriteException)) {
        return null;
    }

    if (typeof err.code === "number" && Number.isFinite(err.code)) {
        return err.code;
    }

    if (typeof err.code === "string") {
        const parsed = Number(err.code);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function isNotFoundAppwriteError(err: unknown): boolean {
    return getAppwriteErrorCode(err) === 404;
}

function isConflictAppwriteError(err: unknown): boolean {
    return getAppwriteErrorCode(err) === 409;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function uploadPredefinedFrameAssetAction(
    formData: FormData,
): Promise<void> {
    const frameId = String(formData.get("frameId") ?? "").trim();

    try {
        await requireAdmin();
        const file = formData.get("file");

        const storageFileId = getPresetFrameStorageFileId(frameId);
        if (!storageFileId) {
            throw new Error("Invalid frame ID: missing storage file mapping");
        }

        if (!(file instanceof File) || file.size === 0) {
            throw new Error("Invalid file: empty or wrong type");
        }

        if (file.size > MAX_PRESET_FRAME_SIZE) {
            throw new Error(
                `File too large: max ${MAX_PRESET_FRAME_SIZE / 1024 / 1024}MB`,
            );
        }

        // Verify PNG signature (magic bytes), not just filename/MIME.
        const header = Buffer.from(await file.slice(0, 8).arrayBuffer());
        if (!header.equals(PNG_SIGNATURE)) {
            throw new Error("File must be a PNG image");
        }

        const { storage } = getAdminClient();
        const env = getEnvConfig();
        const bucketId = env.buckets.avatarFramesPredefined;

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
            try {
                await storage.createFile(bucketId, storageFileId, file);
                revalidatePath("/admin/preset-frames");
                revalidatePath("/settings");
                return;
            } catch (err) {
                if (!isConflictAppwriteError(err)) {
                    throw err;
                }

                try {
                    await storage.deleteFile(bucketId, storageFileId);
                } catch (deleteError) {
                    if (!isNotFoundAppwriteError(deleteError)) {
                        throw deleteError;
                    }
                }

                if (attempt < MAX_CREATE_ATTEMPTS - 1) {
                    await sleep(100 * 2 ** attempt);
                    continue;
                }

                throw err;
            }
        }
    } catch (err) {
        throw err instanceof Error
            ? err
            : new Error(`Failed to upload frame asset: ${toErrorDetails(err)}`);
    }
}

export async function deletePredefinedFrameAssetAction(
    formData: FormData,
): Promise<void> {
    const frameId = String(formData.get("frameId") ?? "").trim();

    try {
        await requireAdmin();
        const storageFileId = getPresetFrameStorageFileId(frameId);
        if (!storageFileId) {
            throw new Error("Invalid frame ID: missing storage file mapping");
        }

        const { storage } = getAdminClient();
        const env = getEnvConfig();
        const bucketId = env.buckets.avatarFramesPredefined;

        // Idempotent delete — tolerate missing file (404).
        try {
            await storage.deleteFile(bucketId, storageFileId);
        } catch (err) {
            if (!isNotFoundAppwriteError(err)) {
                throw err;
            }
        }

        revalidatePath("/admin/preset-frames");
        revalidatePath("/settings");
    } catch (err) {
        throw err instanceof Error
            ? err
            : new Error(`Failed to delete frame asset: ${toErrorDetails(err)}`);
    }
}
