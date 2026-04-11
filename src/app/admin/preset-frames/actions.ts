"use server";

import { revalidatePath } from "next/cache";
import { AppwriteException } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { requireAdmin } from "@/lib/auth-server";
import { getPresetFrameStorageFileId } from "@/lib/preset-frames";

const MAX_PRESET_FRAME_SIZE = 1 * 1024 * 1024;

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
        const PNG_SIGNATURE = Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        if (!header.equals(PNG_SIGNATURE)) {
            throw new Error("File must be a PNG image");
        }

        const { storage } = getAdminClient();
        const env = getEnvConfig();
        const bucketId = env.buckets.avatarFramesPredefined;

        // Delete existing file first since createFile does not overwrite.
        try {
            await storage.deleteFile(bucketId, storageFileId);
        } catch (err) {
            if (!(err instanceof AppwriteException) || err.code !== 404) {
                throw err;
            }
            // No existing file — continue with create.
        }

        await storage.createFile(bucketId, storageFileId, file);

        revalidatePath("/admin/preset-frames");
        revalidatePath("/settings");
    } catch (err) {
        throw err instanceof Error
            ? err
            : new Error("Failed to upload frame asset");
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
            if (!(err instanceof AppwriteException) || err.code !== 404) {
                throw err;
            }
        }

        revalidatePath("/admin/preset-frames");
        revalidatePath("/settings");
    } catch (err) {
        throw err instanceof Error
            ? err
            : new Error("Failed to delete frame asset");
    }
}
