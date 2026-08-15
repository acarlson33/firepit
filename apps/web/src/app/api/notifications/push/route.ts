import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";
import Expo from "expo-server-sdk";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
    logger,
    returnForbidden,
    returnUnauthorized,
} from "@/lib/newrelic-utils";

type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * POST /api/notifications/push
 * Send a push notification to the authenticated user by looking up their
 * stored Expo push tokens and dispatching via the Expo Push SDK.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const payload = (await request.json()) as PushPayload;
        const { userId, title, body, data } = payload;

        if (!userId || !title) {
            return NextResponse.json(
                { error: "userId and title are required" },
                { status: 400 },
            );
        }

        if (userId !== session.$id) {
            return returnForbidden();
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Look up push tokens for the target user
        const tokensResult = await databases.listDocuments(
            env.databaseId,
            env.collections.pushTokens,
            [Query.equal("userId", userId)],
        );

        const tokenDocuments = tokensResult.documents;
        const tokenById = new Map(
            tokenDocuments
                .filter((doc) => typeof doc.token === "string")
                .map((doc) => [doc.token as string, doc.$id]),
        );

        const tokens = tokenDocuments.map(
            (doc) => doc.token as string,
        );

        if (tokens.length === 0) {
            return NextResponse.json({
                success: true,
                sent: 0,
                message: "No push tokens found for user",
            });
        }

        // Filter out invalid Expo push tokens
        const expoPushTokens = tokens.filter((t) => Expo.isExpoPushToken(t));

        if (expoPushTokens.length === 0) {
            return NextResponse.json({
                success: true,
                sent: 0,
                message: "No valid Expo push tokens found",
            });
        }

        // Build messages
        const messages = expoPushTokens.map((token) => ({
            to: token,
            sound: "default" as const,
            title,
            body: body ?? "",
            data: data ?? {},
        }));

        // Send via Expo Push SDK
        const expo = new Expo();
        const chunks = expo.chunkPushNotifications(messages);
        const results: Array<{ status: string; token: string; error?: string }> = [];

        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                for (let i = 0; i < ticketChunk.length; i++) {
                    const ticket = ticketChunk[i];
                    const token = (chunk[i] as { to: string }).to;
                    const isDeviceNotRegistered =
                        ticket.status === "error" &&
                        ticket.details?.error === "DeviceNotRegistered";

                    if (isDeviceNotRegistered) {
                        const documentId = tokenById.get(token);
                        if (documentId) {
                            await databases
                                .deleteDocument(
                                    env.databaseId,
                                    env.collections.pushTokens,
                                    documentId,
                                )
                                .catch(() => undefined);
                        }
                    }

                    results.push({
                        status: ticket.status,
                        token: token.slice(0, 20) + "...",
                        error:
                            ticket.status === "error"
                                ? ticket.details?.error
                                : undefined,
                    });
                }
            } catch (error) {
                for (const tokenMessage of chunk) {
                    results.push({
                        status: "error",
                        token: (tokenMessage as unknown as { to: string }).to.slice(0, 20) + "...",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            sent: expoPushTokens.length,
            results,
        });
    } catch (error) {
        logger.error("[push] Dispatch failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to send push notification" },
            { status: 500 },
        );
    }
}
