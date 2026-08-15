import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    deleteAvatarFile,
    getOrCreateUserProfile,
    getAvatarUrl,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import { logger } from "@/lib/newrelic-utils";

const ALLOWED_AVATAR_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
]);
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json(
                { error: "Expected multipart/form-data" },
                { status: 400 },
            );
        }

        const formData = await request.formData();
        const file = formData.get("avatar");

        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 },
            );
        }

        if (file.size > MAX_AVATAR_SIZE) {
            return NextResponse.json(
                { error: "File size must be less than 2MB" },
                { status: 413 },
            );
        }

        if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
            return NextResponse.json(
                {
                    error:
                        "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
                },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const profile = await getOrCreateUserProfile(session.$id, session.name);
        const previousAvatarFileId = profile.avatarFileId;

        const { storage } = getServerClient();
        const uploadedFile = await storage.createFile(
            env.buckets.avatars,
            ID.unique(),
            InputFile.fromBuffer(file, file.name),
            [
                Permission.read(Role.any()),
                Permission.update(Role.user(session.$id)),
                Permission.delete(Role.user(session.$id)),
            ],
        );

        try {
            await updateUserProfile(profile.$id, {
                avatarFileId: uploadedFile.$id,
            });
        } catch (error) {
            // Roll back the uploaded file so a failed profile update does not
            // orphan a file in storage.
            try {
                await deleteAvatarFile(uploadedFile.$id);
            } catch {
                // best-effort cleanup
            }
            throw error;
        }

        if (previousAvatarFileId && previousAvatarFileId !== uploadedFile.$id) {
            try {
                await deleteAvatarFile(previousAvatarFileId);
            } catch {
                // Non-fatal cleanup failure
            }
        }

        const avatarUrl = getAvatarUrl(uploadedFile.$id);

        return NextResponse.json({
            fileId: uploadedFile.$id,
            avatarUrl,
        });
    } catch (error) {
        logger.error("Failed to upload avatar", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to upload avatar" },
            { status: 500 },
        );
    }
}

export async function DELETE() {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const profile = await getOrCreateUserProfile(session.$id, session.name);
        const previousAvatarFileId = profile.avatarFileId;

        await updateUserProfile(profile.$id, {
            avatarFileId: null,
        });

        if (previousAvatarFileId) {
            try {
                await deleteAvatarFile(previousAvatarFileId);
            } catch {
                // Non-fatal cleanup failure
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to remove avatar", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to remove avatar" },
            { status: 500 },
        );
    }
}
