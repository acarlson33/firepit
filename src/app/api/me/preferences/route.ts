import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
} from "@/lib/appwrite-profiles";

type PreferencesResponse = {
    showDocsInNavigation: boolean;
};

function toPreferencesResponse(
    showDocsInNavigation: boolean | undefined,
): PreferencesResponse {
    return {
        showDocsInNavigation: showDocsInNavigation ?? true,
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

        return NextResponse.json(
            toPreferencesResponse(profile.showDocsInNavigation),
        );
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

type PatchRequestBody = {
    showDocsInNavigation?: boolean;
};

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

        if (typeof body.showDocsInNavigation !== "boolean") {
            return NextResponse.json(
                {
                    error: "Invalid showDocsInNavigation value. Must be a boolean",
                },
                { status: 400 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);
        const updatedProfile = await updateUserProfile(profile.$id, {
            showDocsInNavigation: body.showDocsInNavigation,
        });

        return NextResponse.json(
            toPreferencesResponse(updatedProfile.showDocsInNavigation),
        );
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
