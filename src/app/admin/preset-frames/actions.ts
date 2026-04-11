"use server";

import { revalidatePath } from "next/cache";

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
            return;
        }

        if (!(file instanceof File) || file.size === 0) {
            return;
        }

        if (file.size > MAX_PRESET_FRAME_SIZE) {
            return;
        }

        const isPng = file.type === "image/png" || file.name.endsWith(".png");
        if (!isPng) {
            return;
        }

        const { storage } = getAdminClient();
        const env = getEnvConfig();
        const bucketId = env.buckets.avatarFramesPredefined;

        try {
            await storage.getFile(bucketId, storageFileId);
            await storage.deleteFile(bucketId, storageFileId);
        } catch {
            // No existing file found. Continue with create.
        }

        await storage.createFile(bucketId, storageFileId, file);

        revalidatePath("/admin/preset-frames");
        revalidatePath("/settings");
        return;
    } catch {
        return;
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
            return;
        }

        const { storage } = getAdminClient();
        const env = getEnvConfig();
        const bucketId = env.buckets.avatarFramesPredefined;

        await storage.deleteFile(bucketId, storageFileId);

        revalidatePath("/admin/preset-frames");
        revalidatePath("/settings");
        return;
    } catch {
        return;
    }
}
