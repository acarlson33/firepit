import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID, Query } from "node-appwrite";
import Expo from "expo-server-sdk";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger, returnUnauthorized } from "@/lib/newrelic-utils";

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

        if (!Expo.isExpoPushToken(token)) {
            return NextResponse.json(
                { error: "token is not a valid Expo push token" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Look up every document that holds this token so a stale owner's
        // record is removed before registering it for the current user.
        const byToken = await databases.listDocuments(
            env.databaseId,
            env.collections.pushTokens,
            [Query.equal("token", token)],
        );

        const ownedDocuments = byToken.documents.filter(
            (doc) => doc.userId === session.$id,
        );

        for (const doc of byToken.documents) {
            if (doc.userId !== session.$id) {
                await databases
                    .deleteDocument(
                        env.databaseId,
                        env.collections.pushTokens,
                        doc.$id,
                    )
                    .catch(() => undefined);
            }
        }

        if (ownedDocuments.length > 0) {
            // Token already registered for this user — just touch the updatedAt
            await databases.updateDocument(
                env.databaseId,
                env.collections.pushTokens,
                ownedDocuments[0].$id,
                { updatedAt: new Date().toISOString() },
            );
        } else {
            // New token — create it
            await databases.createDocument(
                env.databaseId,
                env.collections.pushTokens,
                ID.unique(),
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
        logger.error("[push] Token registration failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to register token" },
            { status: 500 },
        );
    }
}
