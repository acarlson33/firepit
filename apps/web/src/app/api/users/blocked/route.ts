import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getAvatarUrl, getProfilesByUserIds } from "@/lib/appwrite-profiles";
import {
    listBlockedUsers,
    RelationshipError,
} from "@/lib/appwrite-friendships";

export async function GET() {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const blocks = await listBlockedUsers(user.$id);
        const profiles = await getProfilesByUserIds(
            blocks.map((block) => block.blockedUserId),
        );

        const items = blocks.map((block) => {
            const profile = profiles.get(block.blockedUserId);
            return {
                block,
                user: {
                    userId: block.blockedUserId,
                    displayName: profile?.displayName,
                    pronouns: profile?.pronouns,
                    avatarUrl: profile?.avatarFileId
                        ? getAvatarUrl(profile.avatarFileId)
                        : undefined,
                },
            };
        });

        return NextResponse.json({ items });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to list blocked users";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
