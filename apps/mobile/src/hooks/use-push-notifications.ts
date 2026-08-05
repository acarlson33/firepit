import { useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";

import { saveNotificationToken } from "@/lib/firepit/persistence";
import { authHeaders } from "@/lib/firepit/http";

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Register notification categories with action buttons (iOS)
async function registerNotificationCategories() {
  if (Platform.OS !== "ios") return;
  await Notifications.setNotificationCategoryAsync("message", [
    {
      identifier: "open",
      buttonTitle: "Open",
      options: { opensAppToForeground: true },
    },
  ]);
}

// Create Android notification channel (required for Android 8+)
async function registerAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("firepit-messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    showBadge: true,
  });
}

// Call once at startup
void registerNotificationCategories();
void registerAndroidChannel();

/**
 * Push notification data payload sent from the server.
 */
export type PushNotificationData = {
  type: "message" | "mention" | "dm";
  serverId?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
};

/**
 * Hook to handle incoming push notifications.
 * Call once at the app root level.
 */
export function usePushNotificationHandler() {
  const lastDataRef = useRef<PushNotificationData | null>(null);

  const navigateTo = useCallback((data: PushNotificationData) => {
    if (data.type === "dm" && data.conversationId && data.messageId) {
      router.push(
        `/thread/${data.conversationId}/${data.messageId}` as never,
      );
    } else if (data.type === "message" && data.serverId && data.channelId && data.messageId) {
      router.push(
        `/thread/${data.serverId}/${data.channelId}/${data.messageId}` as never,
      );
    }
  }, []);

  useEffect(() => {
    // Foreground: notification received while app is open
    const notifSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as
          | PushNotificationData
          | undefined;
        if (data) {
          lastDataRef.current = data;
        }
      },
    );

    // Background/killed: user tapped the notification
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | PushNotificationData
          | undefined;
        if (data) {
          navigateTo(data);
        }
      },
    );

    return () => {
      notifSub.remove();
      responseSub.remove();
    };
  }, [navigateTo]);

  return { lastDataRef };
}

/**
 * Register the device for push notifications and store the token server-side.
 */
export async function registerPushToken(
  instanceUrl: string,
  accessToken: string,
): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Store locally
    await saveNotificationToken(token);

    // Store server-side
    try {
      await fetch(`${instanceUrl}/api/notifications/register-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(accessToken),
        },
        body: JSON.stringify({ token }),
      });
    } catch {
      // token is still returned even if server-side registration fails
    }

    return token;
  } catch {
    return null;
  }
}
