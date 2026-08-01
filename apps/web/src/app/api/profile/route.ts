import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import {
    getOrCreateUserProfile,
    updateUserProfile,
    getAvatarUrl,
} from "@/lib/appwrite-profiles";

function normalizeWebsiteInput(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return null;

    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
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

        const body = (await request.json()) as {
            displayName?: string;
            bio?: string;
            pronouns?: string;
            location?: string;
            website?: string;
            profileBackgroundColor?: string | null;
            profileBackgroundGradient?: string | null;
        };

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
            updateData.website = normalizeWebsiteInput(body.website);
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
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update profile",
            },
            { status: 500 },
        );
    }
}
