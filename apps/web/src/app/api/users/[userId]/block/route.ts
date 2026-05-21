import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    blockUser,
    RelationshipError,
    unblockUser,
} from "@/lib/appwrite-friendships";

type BlockRequestBody = {
    reason?: string;
};

export async function POST(
    request: Request,
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
        const body = (await request
            .json()
            .catch(() => ({}))) as BlockRequestBody;
        const block = await blockUser(user.$id, userId, body.reason);

        return NextResponse.json({ block }, { status: 201 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to block user";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

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
        const block = await unblockUser(user.$id, userId);

        return NextResponse.json({ success: true, block });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to unblock user";
        const status = error instanceof RelationshipError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
