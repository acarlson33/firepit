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

const DEFAULT_NAVIGATION_ITEM_ORDER = [
    "docs",
    "friends",
    "settings",
] as const satisfies NavigationItemPreferenceId[];

type PreferencesResponse = NavigationPreferences;

type PatchRequestBody = Partial<NavigationPreferences>;

function normalizeNavigationItemOrder(
    order: NavigationItemPreferenceId[] | undefined,
) {
    const normalizedOrder = Array.isArray(order)
        ? order.filter(
              (item, index, items): item is NavigationItemPreferenceId =>
                  DEFAULT_NAVIGATION_ITEM_ORDER.includes(item) &&
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

function toPreferencesResponse(profile: {
    showDocsInNavigation?: boolean;
    showFriendsInNavigation?: boolean;
    showSettingsInNavigation?: boolean;
    showAddFriendInHeader?: boolean;
    navigationItemOrder?: NavigationItemPreferenceId[];
}): PreferencesResponse {
    return {
        showDocsInNavigation: profile.showDocsInNavigation ?? true,
        showFriendsInNavigation: profile.showFriendsInNavigation ?? true,
        showSettingsInNavigation: profile.showSettingsInNavigation ?? true,
        showAddFriendInHeader: profile.showAddFriendInHeader ?? true,
        navigationItemOrder: normalizeNavigationItemOrder(
            profile.navigationItemOrder,
        ),
    };
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
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch preferences",
            },
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

        const body = (await request.json()) as PatchRequestBody;

        if (
            body.showDocsInNavigation !== undefined &&
            typeof body.showDocsInNavigation !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid showDocsInNavigation value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        if (
            body.showFriendsInNavigation !== undefined &&
            typeof body.showFriendsInNavigation !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid showFriendsInNavigation value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        if (
            body.showSettingsInNavigation !== undefined &&
            typeof body.showSettingsInNavigation !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid showSettingsInNavigation value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        if (
            body.showAddFriendInHeader !== undefined &&
            typeof body.showAddFriendInHeader !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid showAddFriendInHeader value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        if (
            body.navigationItemOrder !== undefined &&
            (!Array.isArray(body.navigationItemOrder) ||
                body.navigationItemOrder.some(
                    (item) => !DEFAULT_NAVIGATION_ITEM_ORDER.includes(item),
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
            body.showDocsInNavigation === undefined &&
            body.showFriendsInNavigation === undefined &&
            body.showSettingsInNavigation === undefined &&
            body.showAddFriendInHeader === undefined &&
            body.navigationItemOrder === undefined
        ) {
            return NextResponse.json(
                {
                    error: "At least one navigation preference must be provided",
                },
                { status: 400 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);
        const mergedPreferences = toPreferencesResponse({
            ...profile,
            ...body,
        });

        const updatedProfile = await updateUserProfile(profile.$id, {
            showDocsInNavigation: mergedPreferences.showDocsInNavigation,
            showFriendsInNavigation: mergedPreferences.showFriendsInNavigation,
            showSettingsInNavigation:
                mergedPreferences.showSettingsInNavigation,
            showAddFriendInHeader: mergedPreferences.showAddFriendInHeader,
            navigationItemOrder: mergedPreferences.navigationItemOrder,
        });

        return NextResponse.json(toPreferencesResponse(updatedProfile));
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update preferences",
            },
            { status: 500 },
        );
    }
}
