"use server";

import { requireAuth } from "@/lib/auth-server";
import {
	getOrCreateUserProfile,
	updateUserProfile,
} from "@/lib/appwrite-profiles";

/**
 * Complete onboarding by setting up user profile
 */
export async function completeOnboardingAction(
	formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
	try {
		const user = await requireAuth();

		// Get or create profile
		const profile = await getOrCreateUserProfile(user.$id, user.name);

		// Extract form data
		const displayName = formData.get("displayName") as string;
		const bio = formData.get("bio") as string;

		if (!displayName?.trim()) {
			return { success: false, error: "Display name is required" };
		}

		// Update profile with onboarding data
		await updateUserProfile(profile.$id, {
			displayName: displayName.trim(),
			bio: bio?.trim() || undefined,
		});

		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			return { success: false, error: error.message };
		}
		return { success: false, error: "Failed to complete onboarding" };
	}
}
