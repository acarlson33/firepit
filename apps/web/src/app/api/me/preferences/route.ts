import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import type {
    NavigationItemPreferenceId,
    NavigationPreferences,
} from "@/lib/types";
import { logger } from "@/lib/newrelic-utils";

const DEFAULT_NAVIGATION_ITEM_ORDER = [
    "docs",
    "friends",
    "settings",
] as const satisfies NavigationItemPreferenceId[];

const BOOLEAN_PREFERENCE_FIELDS = [
    "showDocsInNavigation",
    "showFriendsInNavigation",
    "showSettingsInNavigation",
    "showAddFriendInHeader",
    "telemetryEnabled",
] as const satisfies readonly (keyof NavigationPreferences)[];

type PreferencesResponse = NavigationPreferences;

type PatchRequestBody = Partial<NavigationPreferences>;

type ProfilePreferencesShape = {
    showDocsInNavigation?: boolean;
    showFriendsInNavigation?: boolean;
    showSettingsInNavigation?: boolean;
    showAddFriendInHeader?: boolean;
    telemetryEnabled?: boolean;
    navigationItemOrder?: NavigationItemPreferenceId[] | string;
};

const SUPPORTED_NAVIGATION_ITEMS: ReadonlySet<string> = new Set(
    DEFAULT_NAVIGATION_ITEM_ORDER,
);

function isSupportedNavigationItem(
    value: unknown,
): value is NavigationItemPreferenceId {
    return typeof value === "string" && SUPPORTED_NAVIGATION_ITEMS.has(value);
}

function parseNavigationItemOrder(
    order: NavigationItemPreferenceId[] | string | undefined,
) {
    if (Array.isArray(order)) {
        return order;
    }

    if (typeof order !== "string") {
        return undefined;
    }

    const trimmedOrder = order.trim();
    if (!trimmedOrder) {
        return undefined;
    }

    if (trimmedOrder.startsWith("[")) {
        try {
            const parsedOrder = JSON.parse(trimmedOrder) as unknown;
            return Array.isArray(parsedOrder)
                ? parsedOrder.filter(isSupportedNavigationItem)
                : undefined;
        } catch {
            return undefined;
        }
    }

    return trimmedOrder
        .split(",")
        .map((item) => item.trim())
        .filter(isSupportedNavigationItem);
}

function normalizeNavigationItemOrder(
    order: NavigationItemPreferenceId[] | string | undefined,
) {
    const parsedOrder = parseNavigationItemOrder(order);

    const normalizedOrder = Array.isArray(parsedOrder)
        ? parsedOrder.filter(
              (item, index, items): item is NavigationItemPreferenceId =>
                  isSupportedNavigationItem(item) &&
                  items.indexOf(item) === index,
          )
        : [];

    for (const item of DEFAULT_NAVIGATION_ITEM_ORDER) {
        if (!normalizedOrder.includes(item)) {
            normalizedOrder.push(item);
        }
    }

    return normalizedOrder;
}

function toPreferencesResponse(
    profile: ProfilePreferencesShape,
): PreferencesResponse {
    return {
        showDocsInNavigation: profile.showDocsInNavigation ?? true,
        showFriendsInNavigation: profile.showFriendsInNavigation ?? true,
        showSettingsInNavigation: profile.showSettingsInNavigation ?? true,
        showAddFriendInHeader: profile.showAddFriendInHeader ?? true,
        telemetryEnabled: profile.telemetryEnabled ?? true,
        navigationItemOrder: normalizeNavigationItemOrder(
            profile.navigationItemOrder,
        ),
    };
}

function isLegacyNavigationOrderError(error: unknown) {
    return (
        error instanceof Error &&
        error.message.includes("navigationItemOrder") &&
        error.message.includes("valid string")
    );
}

function serializeNavigationItemOrder(order: NavigationItemPreferenceId[]) {
    return order.join(",");
}

export async function GET() {
    try {
        const user = await getServerSession();

        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);

        return NextResponse.json(toPreferencesResponse(profile));
    } catch (error) {
        logger.error("Failed to fetch preferences", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch preferences" },
            { status: 500 },
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getServerSession();

        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        let body: PatchRequestBody;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        for (const field of BOOLEAN_PREFERENCE_FIELDS) {
            if (body[field] !== undefined && typeof body[field] !== "boolean") {
                return NextResponse.json(
                    {
                        error: `Invalid ${field} value. Must be a boolean`,
                    },
                    { status: 400 },
                );
            }
        }

        if (
            body.navigationItemOrder !== undefined &&
            (!Array.isArray(body.navigationItemOrder) ||
                body.navigationItemOrder.some(
                    (item) => !isSupportedNavigationItem(item),
                ))
        ) {
            return NextResponse.json(
                {
                    error: "Invalid navigationItemOrder value. Must contain only supported navigation items",
                },
                { status: 400 },
            );
        }

        if (
            !BOOLEAN_PREFERENCE_FIELDS.some(
                (field) => body[field] !== undefined,
            ) &&
            body.navigationItemOrder === undefined
        ) {
            return NextResponse.json(
                {
                    error: "At least one navigation preference must be provided",
                },
                { status: 400 },
            );
        }

        const profile = (await getOrCreateUserProfile(
            user.$id,
            user.name,
        )) as ProfilePreferencesShape & { $id: string };
        const mergedPreferences = toPreferencesResponse({
            ...profile,
            ...body,
        });

        const profileUpdate: {
            showDocsInNavigation: boolean;
            showFriendsInNavigation: boolean;
            showSettingsInNavigation: boolean;
            showAddFriendInHeader: boolean;
            telemetryEnabled?: boolean;
            navigationItemOrder?: NavigationItemPreferenceId[];
        } = {
            showDocsInNavigation: mergedPreferences.showDocsInNavigation,
            showFriendsInNavigation: mergedPreferences.showFriendsInNavigation,
            showSettingsInNavigation:
                mergedPreferences.showSettingsInNavigation,
            showAddFriendInHeader: mergedPreferences.showAddFriendInHeader,
        };

        if (
            body.telemetryEnabled !== undefined ||
            profile.telemetryEnabled !== undefined
        ) {
            profileUpdate.telemetryEnabled = mergedPreferences.telemetryEnabled;
        }

        if (body.navigationItemOrder !== undefined) {
            profileUpdate.navigationItemOrder =
                mergedPreferences.navigationItemOrder;
        }

        let updatedProfile: Awaited<ReturnType<typeof updateUserProfile>>;

        try {
            updatedProfile = await updateUserProfile(
                profile.$id,
                profileUpdate,
            );
        } catch (error) {
            if (
                body.navigationItemOrder === undefined ||
                !isLegacyNavigationOrderError(error)
            ) {
                throw error;
            }

            updatedProfile = await updateUserProfile(profile.$id, {
                ...profileUpdate,
                navigationItemOrder: serializeNavigationItemOrder(
                    mergedPreferences.navigationItemOrder,
                ),
            });
        }

        return NextResponse.json(toPreferencesResponse(updatedProfile));
    } catch (error) {
        logger.error("Failed to update preferences", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update preferences" },
            { status: 500 },
        );
    }
}
