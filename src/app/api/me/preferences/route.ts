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

type ProfilePreferencesShape = {
    showDocsInNavigation?: boolean;
    showFriendsInNavigation?: boolean;
    showSettingsInNavigation?: boolean;
    showAddFriendInHeader?: boolean;
    telemetryEnabled?: boolean;
    navigationItemOrder?: NavigationItemPreferenceId[] | string;
};

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
                ? parsedOrder.filter(
                      (item): item is NavigationItemPreferenceId =>
                          typeof item === "string" &&
                          DEFAULT_NAVIGATION_ITEM_ORDER.includes(
                              item as NavigationItemPreferenceId,
                          ),
                  )
                : undefined;
        } catch {
            return undefined;
        }
    }

    return trimmedOrder
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is NavigationItemPreferenceId =>
            DEFAULT_NAVIGATION_ITEM_ORDER.includes(
                item as NavigationItemPreferenceId,
            ),
        );
}

function normalizeNavigationItemOrder(
    order: NavigationItemPreferenceId[] | string | undefined,
) {
    const parsedOrder = parseNavigationItemOrder(order);

    const normalizedOrder = Array.isArray(parsedOrder)
        ? parsedOrder.filter(
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
            body.telemetryEnabled !== undefined &&
            typeof body.telemetryEnabled !== "boolean"
        ) {
            return NextResponse.json(
                {
                    error: "Invalid telemetryEnabled value. Must be a boolean",
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
            body.telemetryEnabled === undefined &&
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

        let updatedProfile;

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
