import { NextResponse } from "next/server";

import {
    createFriendRequest,
    getRelationshipStatus,
    RelationshipError,
} from "@/lib/appwrite-friendships";
import { getServerSession } from "@/lib/auth-server";

type RequestBody = {
    targetUserId?: string;
    userId?: string;
};

export async function POST(request: Request) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = (await request.json()) as RequestBody;
        const targetUserId = body.targetUserId ?? body.userId;
        if (!targetUserId) {
            return NextResponse.json(
                { error: "targetUserId is required" },
                { status: 400 },
            );
        }

        const friendship = await createFriendRequest(user.$id, targetUserId);
        const relationship = await getRelationshipStatus(
            user.$id,
            targetUserId,
        );

        return NextResponse.json({ friendship, relationship }, { status: 201 });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to send friend request";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
