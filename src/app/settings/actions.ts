"use server";

import { revalidatePath } from "next/cache";
import { ID } from "node-appwrite";
import { requireAuth } from "@/lib/auth-server";
import {
	deleteAvatarFile,
	getOrCreateUserProfile,
	updateUserProfile,
} from "@/lib/appwrite-profiles";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * Update user profile server action
 */
export async function updateProfileAction(formData: FormData) {
	const user = await requireAuth();

	// Get or create profile
	const profile = await getOrCreateUserProfile(user.$id, user.name);

	// Extract form data
	const displayName = formData.get("displayName") as string;
	const bio = formData.get("bio") as string;
	const pronouns = formData.get("pronouns") as string;
	const location = formData.get("location") as string;
	const website = formData.get("website") as string;

	// Update profile
	await updateUserProfile(profile.$id, {
		displayName: displayName || undefined,
		bio: bio || undefined,
		pronouns: pronouns || undefined,
		location: location || undefined,
		website: website || undefined,
	});

	revalidatePath("/settings");
}

/**
 * Upload avatar server action
 */
export async function uploadAvatarAction(formData: FormData) {
	const user = await requireAuth();

	// Get or create profile
	const profile = await getOrCreateUserProfile(user.$id, user.name);

	// Get the uploaded file
	const file = formData.get("avatar") as File;

	if (!file || file.size === 0) {
		throw new Error("No file provided");
	}

	// Validate file size (max 2MB)
	if (file.size > 2 * 1024 * 1024) {
		throw new Error("File size must be less than 2MB");
	}

	// Validate file type
	const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
	if (!allowedTypes.includes(file.type)) {
		throw new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed");
	}

	// Delete old avatar if exists
	if (profile.avatarFileId) {
		await deleteAvatarFile(profile.avatarFileId);
	}

	// Upload new avatar
	const { storage } = getAdminClient();
	const env = getEnvConfig();

	const uploadedFile = await storage.createFile(
		env.buckets.avatars,
		ID.unique(),
		file,
	);

	// Update profile with new avatar file ID
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

	// Get profile
	const profile = await getOrCreateUserProfile(user.$id, user.name);

	if (profile.avatarFileId) {
		await deleteAvatarFile(profile.avatarFileId);

		// Update profile to remove avatar reference
		await updateUserProfile(profile.$id, {
			avatarFileId: undefined,
		});
	}

	revalidatePath("/settings");
	return { success: true };
}
