import { Query } from "node-appwrite";
import Expo from "expo-server-sdk";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";

export type PushNotificationData = {
  type: "message" | "mention" | "dm";
  serverId?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
};

const EXPO_SEND_TIMEOUT_MS = 10_000;

let expoClient: Expo | null = null;

function getExpoClient(): Expo | null {
  if (expoClient) {
    return expoClient;
  }

  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken) {
    return null;
  }

  expoClient = new Expo({ accessToken });
  return expoClient;
}

type ExpoChunk = Parameters<Expo["sendPushNotificationsAsync"]>[0];

async function sendChunkWithTimeout(
  expo: Expo,
  chunk: ExpoChunk,
): Promise<Awaited<ReturnType<Expo["sendPushNotificationsAsync"]>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      expo.sendPushNotificationsAsync(chunk),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Expo send timed out")),
          EXPO_SEND_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

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
      env.collections.pushTokens,
      [Query.equal("userId", userId), Query.limit(100)],
    );

    const tokenDocIdsByToken = new Map<string, string>();
    const expoPushTokens: string[] = [];
    for (const doc of tokensResult.documents) {
      const token = doc.token as string;
      if (Expo.isExpoPushToken(token)) {
        expoPushTokens.push(token);
        if (typeof doc.$id === "string") {
          tokenDocIdsByToken.set(token, doc.$id);
        }
      }
    }

    if (expoPushTokens.length === 0) return;

    const messages = expoPushTokens.map((token) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      priority: "high" as const,
    }));

    const expo = getExpoClient();
    if (!expo) {
      logger.warn("EXPO_ACCESS_TOKEN missing; skipping push dispatch");
      return;
    }

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const tickets = await sendChunkWithTimeout(expo, chunk);
        for (const [index, ticket] of tickets.entries()) {
          if (
            ticket.status !== "error" ||
            ticket.details?.error !== "DeviceNotRegistered"
          ) {
            continue;
          }

          const failedToken = chunk[index]?.to;
          const docId =
            typeof failedToken === "string"
              ? tokenDocIdsByToken.get(failedToken)
              : undefined;
          if (!docId) {
            continue;
          }

          try {
            await databases.deleteDocument(
              env.databaseId,
              env.collections.pushTokens,
              docId,
            );
          } catch (deleteError) {
            logger.warn("Failed to delete stale push token", {
              error:
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
            });
          }
        }
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
