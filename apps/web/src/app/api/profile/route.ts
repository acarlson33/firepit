import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
    getAvatarUrl,
} from "@/lib/appwrite-profiles";
import { logger } from "@/lib/newrelic-utils";

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

const MAX_TEXT_FIELD_LENGTHS: Record<
    "displayName" | "bio" | "pronouns" | "location" | "website",
    number
> = {
    displayName: 100,
    bio: 1000,
    pronouns: 50,
    location: 100,
    website: 2048,
};

function normalizeWebsiteInput(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return null;

    const candidate = URL_SCHEME_PATTERN.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    try {
        const parsed = new URL(candidate);
        if (!["http:", "https:"].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
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

        let body: {
            displayName?: string;
            bio?: string;
            pronouns?: string;
            location?: string;
            website?: string;
            profileBackgroundColor?: string | null;
            profileBackgroundGradient?: string | null;
        };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        if (
            body.displayName === undefined &&
            body.bio === undefined &&
            body.pronouns === undefined &&
            body.location === undefined &&
            body.website === undefined &&
            body.profileBackgroundColor === undefined &&
            body.profileBackgroundGradient === undefined
        ) {
            return NextResponse.json(
                { error: "At least one field must be provided" },
                { status: 400 },
            );
        }

        const textFields = [
            "displayName",
            "bio",
            "pronouns",
            "location",
            "website",
        ] as const;
        for (const field of textFields) {
            const value = body[field];
            if (value === undefined) {
                continue;
            }
            if (typeof value !== "string") {
                return NextResponse.json(
                    { error: `${field} must be a string` },
                    { status: 400 },
                );
            }
            if (value.length > MAX_TEXT_FIELD_LENGTHS[field]) {
                return NextResponse.json(
                    {
                        error: `${field} must be ${MAX_TEXT_FIELD_LENGTHS[field]} characters or fewer`,
                    },
                    { status: 400 },
                );
            }
        }

        for (const field of [
            "profileBackgroundColor",
            "profileBackgroundGradient",
        ] as const) {
            const value = body[field];
            if (value !== undefined && typeof value !== "string" && value !== null) {
                return NextResponse.json(
                    { error: `${field} must be a string or null` },
                    { status: 400 },
                );
            }
        }

        if (body.profileBackgroundColor && body.profileBackgroundGradient) {
            return NextResponse.json(
                {
                    error:
                        "Provide either profileBackgroundColor or profileBackgroundGradient, not both",
                },
                { status: 400 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);

        const updateData: Record<string, string | null> = {};
        if (body.displayName !== undefined) {
            updateData.displayName = body.displayName || null;
        }
        if (body.bio !== undefined) {
            updateData.bio = body.bio || null;
        }
        if (body.pronouns !== undefined) {
            updateData.pronouns = body.pronouns || null;
        }
        if (body.location !== undefined) {
            updateData.location = body.location || null;
        }
        if (body.website !== undefined) {
            const normalizedWebsite = normalizeWebsiteInput(body.website);
            if (body.website.trim() && !normalizedWebsite) {
                return NextResponse.json(
                    { error: "Invalid website URL" },
                    { status: 400 },
                );
            }
            updateData.website = normalizedWebsite;
        }
        if (body.profileBackgroundColor !== undefined) {
            updateData.profileBackgroundColor = body.profileBackgroundColor || null;
            updateData.profileBackgroundGradient = null;
        }
        if (body.profileBackgroundGradient !== undefined) {
            updateData.profileBackgroundGradient = body.profileBackgroundGradient || null;
            updateData.profileBackgroundColor = null;
        }

        const updatedProfile = await updateUserProfile(profile.$id, updateData);

        return NextResponse.json({
            userId: updatedProfile.userId,
            displayName: updatedProfile.displayName,
            userName: updatedProfile.userName,
            bio: updatedProfile.bio,
            pronouns: updatedProfile.pronouns,
            location: updatedProfile.location,
            website: updatedProfile.website,
            avatarFileId: updatedProfile.avatarFileId,
            avatarUrl: updatedProfile.avatarFileId
                ? getAvatarUrl(updatedProfile.avatarFileId)
                : undefined,
            profileBackgroundColor: updatedProfile.profileBackgroundColor,
            profileBackgroundGradient: updatedProfile.profileBackgroundGradient,
        });
    } catch (error) {
        logger.error("Failed to update profile", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update profile" },
            { status: 500 },
        );
    }
}
