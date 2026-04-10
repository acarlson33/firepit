import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    getAvatarUrl,
    getPredefinedAvatarFrameUrlByPresetId,
    getProfilesByUserIds,
} from "@/lib/appwrite-profiles";
import {
    getFriendshipOtherUserId,
    listFriendshipsForUser,
    RelationshipError,
} from "@/lib/appwrite-friendships";
import type { Friendship } from "@/lib/types";

function serializeUserSummary(
    userId: string,
    profiles: Awaited<ReturnType<typeof getProfilesByUserIds>>,
) {
    const profile = profiles.get(userId);
    const avatarFramePreset = profile?.avatarFramePreset;

    return {
        userId,
        displayName: profile?.displayName,
        pronouns: profile?.pronouns,
        avatarUrl: profile?.avatarFileId
            ? getAvatarUrl(profile.avatarFileId)
            : undefined,
        avatarFramePreset,
        avatarFrameUrl: avatarFramePreset
            ? getPredefinedAvatarFrameUrlByPresetId(avatarFramePreset)
            : undefined,
    };
}

function serializeFriendshipEntry(
    friendship: Friendship,
    currentUserId: string,
    profiles: Awaited<ReturnType<typeof getProfilesByUserIds>>,
) {
    const otherUserId = getFriendshipOtherUserId(friendship, currentUserId);
    return {
        friendship,
        user: serializeUserSummary(otherUserId, profiles),
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

        const { friends, incoming, outgoing } = await listFriendshipsForUser(
            user.$id,
        );
        const otherUserIds = [...friends, ...incoming, ...outgoing].map(
            (friendship) => getFriendshipOtherUserId(friendship, user.$id),
        );
        const profiles = await getProfilesByUserIds(otherUserIds);

        return NextResponse.json({
            friends: friends.map((friendship) =>
                serializeFriendshipEntry(friendship, user.$id, profiles),
            ),
            incoming: incoming.map((friendship) =>
                serializeFriendshipEntry(friendship, user.$id, profiles),
            ),
            outgoing: outgoing.map((friendship) =>
                serializeFriendshipEntry(friendship, user.$id, profiles),
            ),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to list friends";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
