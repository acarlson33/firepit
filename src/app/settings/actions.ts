"use server";

import { revalidatePath } from "next/cache";
import { ID } from "node-appwrite";
import { requireAuth } from "@/lib/auth-server";
import {
    deleteAvatarFile,
    deleteProfileBackgroundFile,
    getOrCreateUserProfile,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    getEligibleFramesForUser,
    isUserEligibleForFrame,
    isValidPresetFrameId,
} from "@/lib/preset-frames";

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

/**
 * Update user profile server action
 */
export async function updateProfileAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const displayName = formData.get("displayName") as string;
    const bio = formData.get("bio") as string;
    const pronouns = formData.get("pronouns") as string;
    const location = formData.get("location") as string;
    const website = formData.get("website") as string;

    await updateUserProfile(profile.$id, {
        displayName: displayName || null,
        bio: bio || null,
        pronouns: pronouns || null,
        location: location || null,
        website: website || null,
    });

    revalidatePath("/settings");
}

/**
 * Upload avatar server action
 */
export async function uploadAvatarAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const file = formData.get("avatar") as File;

    if (!file || file.size === 0) {
        throw new Error("No file provided");
    }

    if (file.size > 2 * 1024 * 1024) {
        throw new Error("File size must be less than 2MB");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(
            "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
        );
    }

    if (profile.avatarFileId) {
        await deleteAvatarFile(profile.avatarFileId);
    }

    const { storage } = getAdminClient();
    const env = getEnvConfig();

    const uploadedFile = await storage.createFile(
        env.buckets.avatars,
        ID.unique(),
        file,
    );

    await updateUserProfile(profile.$id, {
        avatarFileId: uploadedFile.$id,
    });

    revalidatePath("/settings");
    return { success: true, fileId: uploadedFile.$id };
}

/**
 * Remove avatar server action
 */
export async function removeAvatarAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    if (profile.avatarFileId) {
        await deleteAvatarFile(profile.avatarFileId);

        await updateUserProfile(profile.$id, {
            avatarFileId: null,
        });
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Update profile background color server action
 */
export async function updateProfileBackgroundAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const backgroundColor = formData.get("backgroundColor") as string;
    const backgroundGradient = formData.get("backgroundGradient") as string;

    if (!backgroundColor && !backgroundGradient) {
        await updateUserProfile(profile.$id, {
            profileBackgroundColor: null,
            profileBackgroundGradient: null,
        });
    } else if (backgroundGradient) {
        await updateUserProfile(profile.$id, {
            profileBackgroundColor: null,
            profileBackgroundGradient: backgroundGradient,
        });
    } else {
        await updateUserProfile(profile.$id, {
            profileBackgroundColor: backgroundColor,
            profileBackgroundGradient: null,
        });
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Upload profile background image server action
 * Rate limited to once every 12 hours
 */
export async function uploadProfileBackgroundAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    if (!canChangeBackground(profile)) {
        const remainingMs = getRemainingCooldownMs(profile);
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        throw new Error(
            `You can change your background again in ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`,
        );
    }

    const file = formData.get("background") as File;

    if (!file || file.size === 0) {
        throw new Error("No file provided");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("File size must be less than 5MB");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(
            "Invalid file type. Only JPEG, PNG, and WebP are allowed",
        );
    }

    if (profile.profileBackgroundImageFileId) {
        await deleteProfileBackgroundFile(profile.profileBackgroundImageFileId);
    }

    const { storage } = getAdminClient();
    const env = getEnvConfig();

    const uploadedFile = await storage.createFile(
        env.buckets.profileBackgrounds,
        ID.unique(),
        file,
    );

    await updateUserProfile(profile.$id, {
        profileBackgroundImageFileId: uploadedFile.$id,
        profileBackgroundImageChangedAt: new Date().toISOString(),
        profileBackgroundColor: null,
        profileBackgroundGradient: null,
    });

    revalidatePath("/settings");
    return { success: true, fileId: uploadedFile.$id };
}

/**
 * Remove profile background image server action
 */
export async function removeProfileBackgroundAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    if (profile.profileBackgroundImageFileId) {
        await deleteProfileBackgroundFile(profile.profileBackgroundImageFileId);

        await updateUserProfile(profile.$id, {
            profileBackgroundImageFileId: null,
            profileBackgroundColor: null,
            profileBackgroundGradient: null,
        });
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Get background change cooldown status
 */
export async function getBackgroundCooldownAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const remainingMs = getRemainingCooldownMs(profile);

    if (remainingMs <= 0) {
        return { canChange: true, remainingMs: 0 };
    }

    return {
        canChange: false,
        remainingMs,
        remainingHours: Math.ceil(remainingMs / (60 * 60 * 1000)),
    };
}

/**
 * Set avatar frame preset server action
 */
export async function setAvatarFramePresetAction(frameId: string) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    if (!frameId) {
        await updateUserProfile(profile.$id, {
            avatarFramePreset: null,
            avatarFrameFileId: null,
        });
        revalidatePath("/settings");
        return { success: true };
    }

    if (!isValidPresetFrameId(frameId)) {
        throw new Error("Invalid frame preset");
    }

    const accountCreatedAt = user.$createdAt;
    if (!isUserEligibleForFrame(accountCreatedAt, frameId)) {
        throw new Error("You are not eligible for this frame");
    }

    await updateUserProfile(profile.$id, {
        avatarFramePreset: frameId,
    });

    revalidatePath("/settings");
    if (user.$id) {
        revalidatePath(`/profile/${user.$id}`);
    }
    return { success: true };
}

/**
 * Get available avatar frames for the current user
 */
export async function getAvailableFramesAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const accountCreatedAt = user.$createdAt;

    const eligibleFrames = getEligibleFramesForUser(accountCreatedAt);

    return {
        frames: eligibleFrames,
        currentPreset: profile.avatarFramePreset,
    };
}
