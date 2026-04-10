"use server";

import { createHash } from "node:crypto";
import { AuthError, requireAuth } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import {
    getOrCreateNotificationSettings,
    updateNotificationSettings,
} from "@/lib/notification-settings";
import type { NotificationLevel, DirectMessagePrivacy } from "@/lib/types";
import {
    DIRECT_MESSAGE_PRIVACY_VALUES,
    NOTIFICATION_LEVEL_VALUES,
} from "@/lib/types";
import { logger } from "@/lib/newrelic-utils";

function isNotificationLevel(
    value: FormDataEntryValue | null,
): value is NotificationLevel {
    return (
        typeof value === "string" &&
        (NOTIFICATION_LEVEL_VALUES as readonly string[]).includes(value)
    );
}

function isDirectMessagePrivacy(
    value: FormDataEntryValue | null,
): value is DirectMessagePrivacy {
    return (
        typeof value === "string" &&
        (DIRECT_MESSAGE_PRIVACY_VALUES as readonly string[]).includes(value)
    );
}

const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_PRONOUNS_LENGTH = 50;
const MAX_BIO_LENGTH = 1000;

function hashIdentifier(identifier: string) {
    return createHash("sha256").update(identifier).digest("hex").slice(0, 16);
}

function isAuthFailure(error: unknown) {
    if (error instanceof AuthError) {
        return true;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return (
        message.includes("unauthorized") ||
        message.includes("forbidden") ||
        message.includes("authentication required")
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
        const userHash = hashIdentifier(user.$id);
        const profileHash = hashIdentifier(profile.$id);

        // Extract profile form data
        const rawDisplayName = formData.get("displayName");
        const rawPronouns = formData.get("pronouns");
        const rawBio = formData.get("bio");

        const displayName =
            typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
        const pronouns =
            typeof rawPronouns === "string" ? rawPronouns.trim() : "";
        const bio = typeof rawBio === "string" ? rawBio.trim() : "";

        if (!displayName) {
            return { success: false, error: "Display name is required" };
        }

        if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
            return {
                success: false,
                error: `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
            };
        }

        if (pronouns.length > MAX_PRONOUNS_LENGTH) {
            return {
                success: false,
                error: `Pronouns must be at most ${MAX_PRONOUNS_LENGTH} characters.`,
            };
        }

        if (bio.length > MAX_BIO_LENGTH) {
            return {
                success: false,
                error: `Bio must be at most ${MAX_BIO_LENGTH} characters.`,
            };
        }

        // Update profile with onboarding data (including pronouns and telemetry)
        const telemetryEnabled = formData.get("telemetryEnabled") === "true";
        const previousProfileSnapshot = {
            bio: profile.bio ?? null,
            displayName: profile.displayName ?? user.name,
            pronouns: profile.pronouns ?? null,
            telemetryEnabled: profile.telemetryEnabled ?? null,
        };

        await updateUserProfile(profile.$id, {
            bio: bio || null,
            displayName,
            pronouns: pronouns || null,
            telemetryEnabled,
        });

        // Extract notification settings
        const rawLevel = formData.get("notificationLevel");
        const rawPrivacy = formData.get("directMessagePrivacy");

        if (rawLevel !== null && !isNotificationLevel(rawLevel)) {
            logger.warn(
                "Invalid onboarding notification level, using default",
                {
                    rawLevel,
                    userId: userHash,
                },
            );
        }

        if (rawPrivacy !== null && !isDirectMessagePrivacy(rawPrivacy)) {
            logger.warn(
                "Invalid onboarding direct message privacy, using default",
                {
                    rawPrivacy,
                    userId: userHash,
                },
            );
        }

        const notificationLevel: NotificationLevel = isNotificationLevel(
            rawLevel,
        )
            ? rawLevel
            : "all";
        const directMessagePrivacy: DirectMessagePrivacy =
            isDirectMessagePrivacy(rawPrivacy) ? rawPrivacy : "everyone";
        const notificationSound = formData.get("notificationSound") === "true";

        // Get or create notification settings and update them
        try {
            const settings = await getOrCreateNotificationSettings(user.$id);
            await updateNotificationSettings(settings.$id, {
                directMessagePrivacy,
                globalNotifications: notificationLevel,
                notificationSound,
            });
        } catch (settingsError) {
            try {
                await updateUserProfile(profile.$id, previousProfileSnapshot);
            } catch (rollbackError) {
                logger.warn("Failed to rollback onboarding profile update", {
                    error:
                        rollbackError instanceof Error
                            ? rollbackError.message
                            : String(rollbackError),
                    profileId: profileHash,
                    userId: userHash,
                });
            }

            logger.error("Failed to update onboarding notification settings", {
                error:
                    settingsError instanceof Error
                        ? settingsError.message
                        : String(settingsError),
                userId: userHash,
            });

            return {
                success: false,
                error: "Failed to save notification settings. Please try again.",
            };
        }

        return { success: true };
    } catch (error) {
        logger.error("Failed to complete onboarding", {
            error: error instanceof Error ? error.message : String(error),
        });

        if (isAuthFailure(error)) {
            return { success: false, error: "Authentication required" };
        }

        return { success: false, error: "Failed to complete onboarding" };
    }
}
