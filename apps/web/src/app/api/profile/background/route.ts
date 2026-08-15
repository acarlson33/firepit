import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    deleteProfileBackgroundFile,
    getOrCreateUserProfile,
    getProfileBackgroundUrl,
    updateProfileBackgroundImageState,
} from "@/lib/appwrite-profiles";
import { getAdminClient } from "@/lib/appwrite-admin";
import { logger } from "@/lib/newrelic-utils";

const ALLOWED_BACKGROUND_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const MAX_BACKGROUND_SIZE = 5 * 1024 * 1024; // 5MB
const BACKGROUND_CHANGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasAllowedImageSignature(bytes: Uint8Array): boolean {
    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return true;
    }

    if (
        bytes.length >= PNG_SIGNATURE.length &&
        PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
    ) {
        return true;
    }

    return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && // R
        bytes[1] === 0x49 && // I
        bytes[2] === 0x46 && // F
        bytes[3] === 0x46 && // F
        bytes[8] === 0x57 && // W
        bytes[9] === 0x45 && // E
        bytes[10] === 0x42 && // B
        bytes[11] === 0x50 // P
    );
}

function getRemainingCooldownMs(profile: {
    profileBackgroundImageChangedAt?: string;
}): number {
    if (!profile.profileBackgroundImageChangedAt) {
        return 0;
    }
    const lastChanged = new Date(
        profile.profileBackgroundImageChangedAt,
    ).getTime();
    if (!Number.isFinite(lastChanged)) {
        return 0;
    }
    const nextAllowed = lastChanged + BACKGROUND_CHANGE_COOLDOWN_MS;
    return Math.max(0, nextAllowed - Date.now());
}

function canChangeBackground(profile: {
    profileBackgroundImageChangedAt?: string;
}): boolean {
    return getRemainingCooldownMs(profile) === 0;
}

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
        const file = formData.get("background");

        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 },
            );
        }

        if (file.size > MAX_BACKGROUND_SIZE) {
            return NextResponse.json(
                { error: "File size must be less than 5MB" },
                { status: 413 },
            );
        }

        if (!ALLOWED_BACKGROUND_TYPES.has(file.type)) {
            return NextResponse.json(
                {
                    error:
                        "Invalid file type. Only JPEG, PNG, and WebP are allowed",
                },
                { status: 400 },
            );
        }

        const signatureBytes = new Uint8Array(
            await file.slice(0, 16).arrayBuffer(),
        );
        if (!hasAllowedImageSignature(signatureBytes)) {
            return NextResponse.json(
                {
                    error:
                        "Invalid file type. Only JPEG, PNG, and WebP are allowed",
                },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const profile = await getOrCreateUserProfile(session.$id, session.name);

        if (!canChangeBackground(profile)) {
            const remainingMs = getRemainingCooldownMs(profile);
            const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
            return NextResponse.json(
                {
                    error: `You can change your background again in ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`,
                },
                { status: 429 },
            );
        }

        const previousBackgroundFileId = profile.profileBackgroundImageFileId;

        const { storage } = getAdminClient();
        const uploadedFile = await storage.createFile(
            env.buckets.profileBackgrounds,
            ID.unique(),
            file,
            [
                Permission.read(Role.any()),
                Permission.update(Role.user(session.$id)),
                Permission.delete(Role.user(session.$id)),
            ],
        );

        try {
            await updateProfileBackgroundImageState(profile.$id, {
                profileBackgroundImageFileId: uploadedFile.$id,
                profileBackgroundImageChangedAt: new Date().toISOString(),
                profileBackgroundColor: null,
                profileBackgroundGradient: null,
            });
        } catch (error) {
            try {
                await deleteProfileBackgroundFile(uploadedFile.$id);
            } catch {
                // Non-fatal cleanup failure
            }
            throw error;
        }

        if (
            previousBackgroundFileId &&
            previousBackgroundFileId !== uploadedFile.$id
        ) {
            try {
                await deleteProfileBackgroundFile(previousBackgroundFileId);
            } catch {
                // Non-fatal cleanup failure
            }
        }

        const backgroundUrl = getProfileBackgroundUrl(uploadedFile.$id);

        return NextResponse.json({
            fileId: uploadedFile.$id,
            backgroundUrl,
        });
    } catch (error) {
        logger.error("Failed to upload profile background", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to upload profile background" },
            { status: 500 },
        );
    }
}
