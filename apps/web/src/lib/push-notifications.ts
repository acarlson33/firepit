import { Query } from "node-appwrite";
import Expo from "expo-server-sdk";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";

const PUSH_TOKENS_COLLECTION = "push_tokens";

export type PushNotificationData = {
  type: "message" | "mention" | "dm";
  serverId?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
};

/**
 * Dispatch a push notification to a user by their userId.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function dispatchPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: PushNotificationData,
): Promise<void> {
  try {
    const env = getEnvConfig();
    const { databases } = getServerClient();

    const tokensResult = await databases.listDocuments(
      env.databaseId,
      PUSH_TOKENS_COLLECTION,
      [Query.equal("userId", userId)],
    );

    const tokens = tokensResult.documents.map((doc) => doc.token as string);
    const expoPushTokens = tokens.filter((t) => Expo.isExpoPushToken(t));

    if (expoPushTokens.length === 0) return;

    const messages = expoPushTokens.map((token) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      priority: "high" as const,
    }));

    const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (chunkError) {
        logger.warn("Push chunk send failed", {
          error: chunkError instanceof Error ? chunkError.message : String(chunkError),
        });
      }
    }
  } catch (error) {
    logger.warn("Push dispatch failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
