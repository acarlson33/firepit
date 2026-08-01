import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useBlockedUsers } from "@/hooks/use-blocked-users";

function getInitials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2)
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
}

function BlockedRow({ entry }: { entry: { block: { $id: string; blockedAt: string }; user: { userId: string; displayName?: string; avatarUrl?: string } } }) {
    const theme = useTheme();
    const initials = getInitials(entry.user.displayName ?? "Unknown");
    const { actionLoading, unblock } = useBlockedUsers();
    const [localLoading, setLocalLoading] = useState(false);
    const isLoading = actionLoading === entry.user.userId || localLoading;

    return (
        <View style={[styles.blockedRow, { backgroundColor: theme.muted }]}>
            <Pressable
                onPress={() => router.push(`/user/${entry.user.userId}` as never)}
                style={styles.blockedRowPressable}
            >
                {entry.user.avatarUrl ? (
                    <Image
                        source={{ uri: entry.user.avatarUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                    />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.mutedForeground + "33" }]}>
                        <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                            {initials}
                        </ThemedText>
                    </View>
                )}
                <View style={styles.blockedInfo}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                        {entry.user.displayName ?? "Unknown"}
                    </ThemedText>
                    <ThemedText type="code" themeColor="mutedForeground" style={{ fontSize: 11 }}>
                        Blocked on {new Date(entry.block.blockedAt).toLocaleDateString()}
                    </ThemedText>
                </View>
            </Pressable>
            <Pressable
                onPress={async () => {
                    setLocalLoading(true);
                    await unblock(entry.user.userId);
                    setLocalLoading(false);
                }}
                disabled={isLoading}
                style={({ pressed }) => ({
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: Spacing.two,
                    paddingVertical: Spacing.one,
                    opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
                })}
            >
                <ThemedText type="smallBold">
                    {isLoading ? "..." : "Unblock"}
                </ThemedText>
            </Pressable>
        </View>
    );
}

export default function PrivacySettingsScreen() {
    const theme = useTheme();
    const { items, loading, error } = useBlockedUsers();

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
            <View
                pointerEvents="none"
                style={[styles.backdropOrbTop, { backgroundColor: "rgba(217, 121, 43, 0.08)" }]}
            />
            <View
                pointerEvents="none"
                style={[styles.backdropOrbBottom, { backgroundColor: "rgba(78, 138, 134, 0.06)" }]}
            />
            <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                <ScrollView
                    style={{ width: "100%" }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.shell}>
                        <View style={styles.header}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={styles.headerButton}
                            >
                                <ThemedText type="smallBold" themeColor="foreground">
                                    Back
                                </ThemedText>
                            </Pressable>
                            <ThemedText type="smallBold">
                                Privacy & Blocking
                            </ThemedText>
                            <View style={styles.headerButton} />
                        </View>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Blocked Users</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Blocked users cannot direct message you or appear in search results.
                            </ThemedText>

                            {loading ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator color={theme.primary} />
                                    <ThemedText themeColor="mutedForeground">
                                        Loading blocked users...
                                    </ThemedText>
                                </View>
                            ) : items.length === 0 ? (
                                <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                                    You have not blocked anyone.
                                </ThemedText>
                            ) : (
                                <View style={styles.blockedList}>
                                    {items.map((item) => (
                                        <BlockedRow key={item.block.$id} entry={item} />
                                    ))}
                                </View>
                            )}

                            {error ? (
                                <ThemedText themeColor="destructive" style={styles.errorText}>
                                    {error}
                                </ThemedText>
                            ) : null}
                        </ThemedView>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -130,
        left: -130,
        zIndex: 0,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -160,
        bottom: 20,
        zIndex: 0,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.two,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.two,
    },
    headerButton: {
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.two,
        minWidth: 60,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    emptyText: { fontSize: 14, lineHeight: 20, paddingVertical: Spacing.four, textAlign: "center" },
    errorText: { fontSize: 13, lineHeight: 18 },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
    },
    blockedList: {
        gap: Spacing.two,
    },
    blockedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        padding: Spacing.two,
        borderRadius: 12,
    },
    blockedRowPressable: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        flex: 1,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarFallback: {
        alignItems: "center",
        justifyContent: "center",
    },
    blockedInfo: {
        flex: 1,
        gap: 2,
    },
});
