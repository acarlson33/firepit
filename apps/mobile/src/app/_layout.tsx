import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useMemo } from "react";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { FirepitProvider } from "@/providers/firepit-provider";

export default function TabLayout() {
    const colorScheme = useColorScheme();
    const themeName = colorScheme === "dark" ? "dark" : "light";
    const palette = Colors[themeName];

    const navigationTheme = useMemo(
        () => ({
            ...(themeName === "dark" ? DarkTheme : DefaultTheme),
            dark: themeName === "dark",
            colors: {
                ...(themeName === "dark"
                    ? DarkTheme.colors
                    : DefaultTheme.colors),
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
            <FirepitProvider>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="explore" />
                    <Stack.Screen name="server/[serverId]" />
                    <Stack.Screen name="server/messages/[serverId]/[channelId]" />
                </Stack>
            </FirepitProvider>
        </ThemeProvider>
    );
}
