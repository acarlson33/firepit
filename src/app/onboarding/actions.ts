"use server";

import { requireAuth } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import {
    getOrCreateNotificationSettings,
    updateNotificationSettings,
} from "@/lib/notification-settings";
import type { NotificationLevel, DirectMessagePrivacy } from "@/lib/types";

const VALID_NOTIFICATION_LEVELS: readonly NotificationLevel[] = [
    "all",
    "mentions",
    "nothing",
] as const;

const VALID_DM_PRIVACY: readonly DirectMessagePrivacy[] = [
    "everyone",
    "friends",
] as const;

function isNotificationLevel(
    value: FormDataEntryValue | null,
): value is NotificationLevel {
    return (
        typeof value === "string" &&
        (VALID_NOTIFICATION_LEVELS as readonly string[]).includes(value)
    );
}

function isDirectMessagePrivacy(
    value: FormDataEntryValue | null,
): value is DirectMessagePrivacy {
    return (
        typeof value === "string" &&
        (VALID_DM_PRIVACY as readonly string[]).includes(value)
    );
}

/**
 * Complete onboarding by setting up user profile and preferences
 */
export async function completeOnboardingAction(
    formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const user = await requireAuth();

        // Get or create profile
        const profile = await getOrCreateUserProfile(user.$id, user.name);

        // Extract profile form data
        const displayName = formData.get("displayName") as string;
        const pronouns = formData.get("pronouns") as string;
        const bio = formData.get("bio") as string;

        if (!displayName?.trim()) {
            return { success: false, error: "Display name is required" };
        }

        // Update profile with onboarding data (including pronouns and telemetry)
        const telemetryEnabled = formData.get("telemetryEnabled") === "true";

        await updateUserProfile(profile.$id, {
            bio: bio?.trim() || undefined,
            displayName: displayName.trim(),
            pronouns: pronouns?.trim() || undefined,
            telemetryEnabled,
        });

        // Extract notification settings
        const rawLevel = formData.get("notificationLevel");
        const rawPrivacy = formData.get("directMessagePrivacy");
        const notificationLevel: NotificationLevel = isNotificationLevel(
            rawLevel,
        )
            ? rawLevel
            : "all";
        const directMessagePrivacy: DirectMessagePrivacy =
            isDirectMessagePrivacy(rawPrivacy) ? rawPrivacy : "everyone";
        const notificationSound = formData.get("notificationSound") === "true";

        // Get or create notification settings and update them
        const settings = await getOrCreateNotificationSettings(user.$id);
        await updateNotificationSettings(settings.$id, {
            directMessagePrivacy,
            globalNotifications: notificationLevel,
            notificationSound,
        });

        return { success: true };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message };
        }
        return { success: false, error: "Failed to complete onboarding" };
    }
}
