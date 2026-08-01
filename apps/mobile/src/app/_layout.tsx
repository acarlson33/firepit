import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useCallback, useMemo } from "react";
import { View, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { FirepitProvider } from "@/providers/firepit-provider";
import { UpdateProvider } from "@/providers/update-provider";
import { CacheSettingsProvider } from "@/providers/cache-settings-context";
import { OrientationGate } from "@/components/orientation-gate";
import { UpdatePromptModal } from "@/components/update/update-prompt-modal";
import { OfflineBanner } from "@/components/offline-banner";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useUpdate } from "@/providers/update-provider";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { initSentry, Sentry } from "@/lib/sentry";
import { router } from "expo-router";

initSentry();

function UpdatePromptGate() {
  const { showPrompt, result, dismissPrompt } = useUpdate();

  const handleSettings = useCallback(() => {
    dismissPrompt(false);
    router.push("/settings/updates" as never);
  }, [dismissPrompt]);

  if (!showPrompt) return null;

  return (
    <UpdatePromptModal
      result={result}
      onDismiss={dismissPrompt}
      onSettings={handleSettings}
    />
  );
}

function TabLayout() {
    const colorScheme = useColorScheme();
    const themeName = colorScheme === "dark" ? "dark" : "light";
    const palette = Colors[themeName];
    const { isConnected } = useNetworkStatus();

    const navigationTheme = useMemo(
        () => ({
            ...(themeName === "dark" ? DarkTheme : DefaultTheme),
            dark: themeName === "dark",
            colors: {
                ...(themeName === "dark" ? DarkTheme.colors : DefaultTheme.colors),
                background: palette.background,
                card: palette.card,
                text: palette.foreground,
                border: palette.border,
                primary: palette.primary,
                notification: palette.destructive,
            },
        }),
        [palette, themeName],
    );

    return (
        <ThemeProvider value={navigationTheme}>
            <AppErrorBoundary palette={palette}>
            <OrientationGate>
                <FirepitProvider>
                    <CacheSettingsProvider>
                        <UpdateProvider>
                            <View style={{ flex: 1, backgroundColor: palette.background }}>
                                {isConnected === false && <OfflineBanner />}
                                <Stack screenOptions={{ headerShown: false }}>
                                    <Stack.Screen name="index" />
                                    <Stack.Screen name="login" />
                                    <Stack.Screen name="(tabs)" />
                                    <Stack.Screen name="explore" />
                                    <Stack.Screen name="search" />
                                    <Stack.Screen name="friends" />
                                    <Stack.Screen name="create-server" />
                                    <Stack.Screen name="invite/[inviteCode]" />
                                    <Stack.Screen name="server/[serverId]" />
                                    <Stack.Screen name="server/messages/[serverId]/[channelId]" />
                                    <Stack.Screen name="thread/[serverId]/[channelId]/[messageId]" />
                                    <Stack.Screen name="thread/[conversationId]/[messageId]" />
                                    <Stack.Screen name="dm/[conversationId]" />
                                    <Stack.Screen name="settings/notifications" />
                                    <Stack.Screen name="settings/updates" />
                                    <Stack.Screen name="settings/appearance" />
                                    <Stack.Screen name="settings/privacy" />
                                </Stack>
                            </View>
                        <UpdatePromptGate />
                        </UpdateProvider>
                    </CacheSettingsProvider>
                </FirepitProvider>
            </OrientationGate>
            </AppErrorBoundary>
        </ThemeProvider>
    );
}

export default Sentry.wrap(TabLayout);
