import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    buildNotificationSettingsResponse,
    getOrCreateNotificationSettings,
    updateNotificationSettings,
} from "@/lib/notification-settings";
import { invalidateNotificationSettingsCache } from "@/lib/notification-triggers";
import { getUserProfile } from "@/lib/appwrite-profiles";
import type {
    DirectMessagePrivacy,
    NotificationLevel,
    NotificationOverrideMap,
    NotificationOverride,
} from "@/lib/types";

const VALID_NOTIFICATION_LEVELS: NotificationLevel[] = [
    "all",
    "mentions",
    "nothing",
];
const VALID_DM_PRIVACY: DirectMessagePrivacy[] = ["everyone", "friends"];

function isTimezoneValid(timeZone: string): boolean {
    try {
        Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

function isValidOverrideMap(
    overrides: unknown,
): overrides is NotificationOverrideMap {
    if (
        !overrides ||
        typeof overrides !== "object" ||
        Array.isArray(overrides)
    ) {
        return false;
    }

    return Object.values(overrides).every((override) => {
        if (!override || typeof override !== "object") {
            return false;
        }

        const candidate = override as NotificationOverride;
        const mutedUntilIsValid =
            candidate.mutedUntil === undefined ||
            typeof candidate.mutedUntil === "string";

        return (
            VALID_NOTIFICATION_LEVELS.includes(candidate.level) &&
            mutedUntilIsValid
        );
    });
}

/**
 * GET /api/notifications/settings
 * Fetches notification settings for the authenticated user
 */
export async function GET() {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const settings = await getOrCreateNotificationSettings(user.$id);

        if (!settings) {
            return NextResponse.json(
                { error: "Failed to get notification settings" },
                { status: 500 },
            );
        }

        return NextResponse.json(
            await buildNotificationSettingsResponse(user.$id, settings),
        );
    } catch (error) {
        const status =
            typeof (error as { status?: unknown }).status === "number"
                ? (error as { status: number }).status
                : 500;

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch notification settings",
            },
            { status },
        );
    }
}

interface PatchRequestBody {
    globalNotifications?: NotificationLevel;
    directMessagePrivacy?: DirectMessagePrivacy;
    dmEncryptionEnabled?: boolean;
    desktopNotifications?: boolean;
    pushNotifications?: boolean;
    notificationSound?: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    quietHoursTimezone?: string | null;
    serverOverrides?: NotificationOverrideMap;
    channelOverrides?: NotificationOverrideMap;
    conversationOverrides?: NotificationOverrideMap;
}

/**
 * PATCH /api/notifications/settings
 * Updates notification settings for the authenticated user
 */
export async function PATCH(request: Request) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = (await request.json()) as PatchRequestBody;

        // Validate globalNotifications if provided
        if (
            body.globalNotifications !== undefined &&
            !VALID_NOTIFICATION_LEVELS.includes(body.globalNotifications)
        ) {
            return NextResponse.json(
                {
                    error: "Invalid globalNotifications value. Must be 'all', 'mentions', or 'nothing'",
                },
                { status: 400 },
            );
        }

        if (
            body.directMessagePrivacy !== undefined &&
            !VALID_DM_PRIVACY.includes(body.directMessagePrivacy)
        ) {
            return NextResponse.json(
                {
                    error: "Invalid directMessagePrivacy value. Must be 'everyone' or 'friends'",
                },
                { status: 400 },
            );
        }

        if (
            body.dmEncryptionEnabled !== undefined &&
            typeof body.dmEncryptionEnabled !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid dmEncryptionEnabled value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        if (body.dmEncryptionEnabled === true) {
            const currentProfile = await getUserProfile(user.$id);
            const hasPublishedPublicKey =
                typeof currentProfile?.dmEncryptionPublicKey === "string" &&
                currentProfile.dmEncryptionPublicKey.trim().length > 0;

            if (!hasPublishedPublicKey) {
                return NextResponse.json(
                    {
                        error:
                            "dmEncryptionEnabled requires a published dmEncryptionPublicKey",
                    },
                    { status: 400 },
                );
            }
        }

        // Validate quiet hours format if provided (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (body.quietHoursStart && !timeRegex.test(body.quietHoursStart)) {
            return NextResponse.json(
                {
                    error: "Invalid quietHoursStart format. Must be HH:MM (24-hour)",
                },
                { status: 400 },
            );
        }
        if (body.quietHoursEnd && !timeRegex.test(body.quietHoursEnd)) {
            return NextResponse.json(
                {
                    error: "Invalid quietHoursEnd format. Must be HH:MM (24-hour)",
                },
                { status: 400 },
            );
        }

        const quietHoursState = [
            body.quietHoursStart,
            body.quietHoursEnd,
            body.quietHoursTimezone,
        ];
        const quietHoursFieldsProvided = quietHoursState.filter(
            (value) => value !== undefined,
        ).length;

        if (
            quietHoursFieldsProvided > 0 &&
            body.quietHoursStart !== null &&
            body.quietHoursEnd !== null &&
            Boolean(body.quietHoursStart) !== Boolean(body.quietHoursEnd)
        ) {
            return NextResponse.json(
                {
                    error: "quietHoursStart and quietHoursEnd must both be provided together",
                },
                { status: 400 },
            );
        }

        if (
            body.quietHoursTimezone &&
            !isTimezoneValid(body.quietHoursTimezone)
        ) {
            return NextResponse.json(
                {
                    error: "Invalid quietHoursTimezone. Must be a valid IANA timezone",
                },
                { status: 400 },
            );
        }

        if (
            body.serverOverrides !== undefined &&
            !isValidOverrideMap(body.serverOverrides)
        ) {
            return NextResponse.json(
                { error: "Invalid serverOverrides payload" },
                { status: 400 },
            );
        }

        if (
            body.channelOverrides !== undefined &&
            !isValidOverrideMap(body.channelOverrides)
        ) {
            return NextResponse.json(
                { error: "Invalid channelOverrides payload" },
                { status: 400 },
            );
        }

        if (
            body.conversationOverrides !== undefined &&
            !isValidOverrideMap(body.conversationOverrides)
        ) {
            return NextResponse.json(
                { error: "Invalid conversationOverrides payload" },
                { status: 400 },
            );
        }

        // Get existing settings to get the document ID
        const existingSettings = await getOrCreateNotificationSettings(
            user.$id,
        );
        if (!existingSettings) {
            return NextResponse.json(
                { error: "Failed to get notification settings" },
                { status: 500 },
            );
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (body.globalNotifications !== undefined) {
            updateData.globalNotifications = body.globalNotifications;
        }
        if (body.directMessagePrivacy !== undefined) {
            updateData.directMessagePrivacy = body.directMessagePrivacy;
        }
        if (body.dmEncryptionEnabled !== undefined) {
            updateData.dmEncryptionEnabled = body.dmEncryptionEnabled;
        }
        if (body.desktopNotifications !== undefined) {
            updateData.desktopNotifications = body.desktopNotifications;
        }
        if (body.pushNotifications !== undefined) {
            updateData.pushNotifications = body.pushNotifications;
        }
        if (body.notificationSound !== undefined) {
            updateData.notificationSound = body.notificationSound;
        }
        if (body.quietHoursStart !== undefined) {
            updateData.quietHoursStart = body.quietHoursStart ?? null;
        }
        if (body.quietHoursEnd !== undefined) {
            updateData.quietHoursEnd = body.quietHoursEnd ?? null;
        }
        if (body.quietHoursTimezone !== undefined) {
            updateData.quietHoursTimezone = body.quietHoursTimezone ?? null;
        }
        if (body.serverOverrides !== undefined) {
            updateData.serverOverrides = body.serverOverrides;
        }
        if (body.channelOverrides !== undefined) {
            updateData.channelOverrides = body.channelOverrides;
        }
        if (body.conversationOverrides !== undefined) {
            updateData.conversationOverrides = body.conversationOverrides;
        }

        // Only update if there are changes
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({
                message: "No changes provided",
                settings: await buildNotificationSettingsResponse(
                    user.$id,
                    existingSettings,
                ),
            });
        }

        const updatedSettings = await updateNotificationSettings(
            existingSettings.$id,
            updateData,
        );

        if (!updatedSettings) {
            return NextResponse.json(
                { error: "Failed to update notification settings" },
                { status: 500 },
            );
        }

        invalidateNotificationSettingsCache(user.$id);

        return NextResponse.json(
            await buildNotificationSettingsResponse(user.$id, updatedSettings),
        );
    } catch (error) {
        const status =
            typeof (error as { status?: unknown }).status === "number"
                ? (error as { status: number }).status
                : 500;

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update notification settings",
            },
            { status },
        );
    }
}
