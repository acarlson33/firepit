import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

function StatusPill({
    label,
    tone,
}: {
    label: string;
    tone: "neutral" | "success" | "warning" | "danger";
}) {
    const theme = useTheme();
    return (
        <ThemedView type={tone === "neutral" ? "muted" : tone} style={styles.pill}>
            <ThemedText
                type="code"
                themeColor={tone === "neutral" ? "mutedForeground" : "foreground"}
            >
                {label}
            </ThemedText>
        </ThemedView>
    );
}

function SettingsRow({
    label,
    description,
    onPress,
}: {
    label: string;
    description: string;
    onPress: () => void;
}) {
    const theme = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.settingsRow,
                {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.92 : 1,
                },
            ]}
        >
            <View style={styles.settingsRowCopy}>
                <ThemedText type="smallBold">{label}</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.settingsRowDesc}>
                    {description}
                </ThemedText>
            </View>
            <ThemedText type="code" themeColor="mutedForeground">
                ›
            </ThemedText>
        </Pressable>
    );
}

export default function SettingsTabScreen() {
    const theme = useTheme();
    const { currentUser, instanceUrl, notificationPreferences } =
        useFirepitBootstrap();

    const notifEnabled = notificationPreferences?.enabled ?? false;

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbTop,
                    { backgroundColor: "rgba(217, 121, 43, 0.16)" },
                ]}
            />
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbBottom,
                    { backgroundColor: "rgba(78, 138, 134, 0.10)" },
                ]}
            />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Firepit settings
                            </ThemedText>
                            <ThemedText type="title">Settings</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Account, notifications, and app preferences.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        currentUser?.displayName ??
                                        currentUser?.userName ??
                                        "signed in"
                                    }
                                    tone="success"
                                />
                                {instanceUrl ? (
                                    <StatusPill
                                        label={new URL(instanceUrl).hostname}
                                        tone="neutral"
                                    />
                                ) : (
                                    <StatusPill label="no instance" tone="warning" />
                                )}
                            </View>
                        </ThemedView>

                        {/* Account section */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Account</ThemedText>
                            <View style={styles.accountInfo}>
                                <View style={styles.accountRow}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        Display name
                                    </ThemedText>
                                    <ThemedText>
                                        {currentUser?.displayName ?? "Not set"}
                                    </ThemedText>
                                </View>
                                <View style={styles.accountRow}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        User ID
                                    </ThemedText>
                                    <ThemedText type="code">
                                        {currentUser?.$id ?? "—"}
                                    </ThemedText>
                                </View>
                                <View style={styles.accountRow}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        Email
                                    </ThemedText>
                                    <ThemedText>
                                        {currentUser?.email ?? "Not available"}
                                    </ThemedText>
                                </View>
                            </View>
                        </ThemedView>

                        {/* Preferences section */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Preferences</ThemedText>
                            <SettingsRow
                                label="Notifications"
                                description={
                                    notifEnabled
                                        ? "Push notifications enabled"
                                        : "Push notifications disabled"
                                }
                                onPress={() =>
                                    router.push(
                                        "/settings/notifications" as never,
                                    )
                                }
                            />
                        </ThemedView>
                    </ThemedView>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    safeArea: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: Spacing.three,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        gap: Spacing.three,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    accountInfo: { gap: Spacing.two },
    accountRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: Spacing.two,
    },
    settingsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
        borderRadius: 16,
        borderWidth: 1,
        padding: Spacing.three,
    },
    settingsRowCopy: { flex: 1, gap: 2 },
    settingsRowDesc: { fontSize: 13, lineHeight: 18 },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -90,
        left: -80,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -120,
        bottom: 40,
    },
});
