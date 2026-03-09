import { NextResponse } from "next/server";

import {
    removeFriendship,
    RelationshipError,
} from "@/lib/appwrite-friendships";
import { getServerSession } from "@/lib/auth-server";

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ userId: string }> },
) {
    try {
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { userId } = await params;
        const friendship = await removeFriendship(user.$id, userId);

        return NextResponse.json({ success: true, friendship });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to remove friendship";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
