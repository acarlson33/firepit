import { NextResponse } from "next/server";

import {
    getRelationshipStatus,
    RelationshipError,
} from "@/lib/appwrite-friendships";
import { getServerSession } from "@/lib/auth-server";

export async function GET(
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
        const relationship = await getRelationshipStatus(user.$id, userId);

        return NextResponse.json({ relationship });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to load relationship status";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
