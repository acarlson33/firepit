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

const ALLOWED_BACKGROUND_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const MAX_BACKGROUND_SIZE = 5 * 1024 * 1024; // 5MB
const BACKGROUND_CHANGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function canChangeBackground(profile: {
    profileBackgroundImageChangedAt?: string;
}): boolean {
    if (!profile.profileBackgroundImageChangedAt) {
        return true;
    }
    const lastChanged = new Date(
        profile.profileBackgroundImageChangedAt,
    ).getTime();
    const now = Date.now();
    return now - lastChanged >= BACKGROUND_CHANGE_COOLDOWN_MS;
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
    const nextAllowed = lastChanged + BACKGROUND_CHANGE_COOLDOWN_MS;
    return Math.max(0, nextAllowed - Date.now());
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

        await updateProfileBackgroundImageState(profile.$id, {
            profileBackgroundImageFileId: uploadedFile.$id,
            profileBackgroundImageChangedAt: new Date().toISOString(),
            profileBackgroundColor: null,
            profileBackgroundGradient: null,
        });

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
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to upload profile background",
            },
            { status: 500 },
        );
    }
}
