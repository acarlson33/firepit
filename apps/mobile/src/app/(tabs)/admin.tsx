import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

function ActionButton({
    label,
    onPress,
    tone = "primary",
}: {
    label: string;
    onPress: () => void;
    tone?: "primary" | "secondary" | "ghost";
}) {
    const theme = useTheme();
    return (
        <ThemedView
            type={tone === "primary" ? "primary" : tone === "secondary" ? "secondary" : "muted"}
            style={styles.actionButton}
        >
            <ThemedText
                type="smallBold"
                themeColor={tone === "primary" ? "primaryForeground" : "foreground"}
                onPress={onPress}
            >
                {label}
            </ThemedText>
        </ThemedView>
    );
}

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

export default function AdminTabScreen() {
    const theme = useTheme();
    const { currentUser, state } = useFirepitBootstrap();
    const isAdmin =
        state === "ready" &&
        currentUser?.roles != null &&
        Object.keys(currentUser.roles).length > 0;

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
                <ThemedView style={styles.shell}>
                    <ThemedView type="card" style={[styles.heroCard, { borderColor: theme.border }]}>
                        <ThemedText type="code" themeColor="accent">
                            Firepit admin
                        </ThemedText>
                        <ThemedText type="title">Administrative tools</ThemedText>
                        <ThemedText themeColor="mutedForeground" style={styles.copy}>
                            Server management, moderation actions, and audit logs.
                            Only available to users with the appropriate permissions.
                        </ThemedText>
                        <View style={styles.pillRow}>
                            <StatusPill label="admin" tone="warning" />
                        </View>
                    </ThemedView>

                    {!isAdmin ? (
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Admin access required</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                You need server administrator permissions to access these tools.
                                Contact a server admin if you need access.
                            </ThemedText>
                        </ThemedView>
                    ) : (
                        <>
                            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                <ThemedText type="smallBold">Server admin</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    View stats, manage channels, roles, and server settings.
                                </ThemedText>
                                <ActionButton
                                    label="Open admin dashboard"
                                    onPress={() => router.push("/admin/index" as never)}
                                />
                            </ThemedView>

                            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                <ThemedText type="smallBold">Moderation</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    Ban, mute, and kick members. Review and manage reports.
                                </ThemedText>
                                <ActionButton
                                    label="Open moderation"
                                    tone="secondary"
                                    onPress={() => router.push("/admin/reports" as never)}
                                />
                            </ThemedView>

                            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                <ThemedText type="smallBold">Audit log</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    Review moderation actions and server changes.
                                </ThemedText>
                                <ActionButton
                                    label="Open audit log"
                                    tone="ghost"
                                    onPress={() => router.push("/admin/audit-log" as never)}
                                />
                            </ThemedView>
                        </>
                    )}
                </ThemedView>
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
    actionButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        alignSelf: "flex-start",
    },
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
