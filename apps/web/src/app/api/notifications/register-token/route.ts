import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { returnUnauthorized } from "@/lib/newrelic-utils";

const PUSH_TOKENS_COLLECTION = "push_tokens";

/**
 * POST /api/notifications/register-token
 * Store an Expo push token for the authenticated user.
 * Upserts — if the same token already exists, just update the timestamp.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const body = (await request.json()) as { token?: string };
        const { token } = body;

        if (!token || typeof token !== "string") {
            return NextResponse.json(
                { error: "token is required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Check if this exact token already exists for this user
        const existing = await databases.listDocuments(
            env.databaseId,
            PUSH_TOKENS_COLLECTION,
            [
                Query.equal("userId", session.$id),
                Query.equal("token", token),
            ],
        );

        if (existing.documents.length > 0) {
            // Token already registered — just touch the updatedAt
            await databases.updateDocument(
                env.databaseId,
                PUSH_TOKENS_COLLECTION,
                existing.documents[0].$id,
                { updatedAt: new Date().toISOString() },
            );
        } else {
            // New token — create it
            await databases.createDocument(
                env.databaseId,
                PUSH_TOKENS_COLLECTION,
                "unique()",
                {
                    userId: session.$id,
                    token,
                    platform: "expo",
                    updatedAt: new Date().toISOString(),
                },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[push] Token registration failed:", error);
        return NextResponse.json(
            { error: "Failed to register token" },
            { status: 500 },
        );
    }
}
