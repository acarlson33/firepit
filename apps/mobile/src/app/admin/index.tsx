import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import {
    ActionButton,
    StatusPill,
} from "@/components/action-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    fetchServerStats,
    type ServerStatsResponse,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

const LOAD_STATE_LABELS: Record<LoadState, string> = {
    idle: "loading",
    loading: "loading",
    ready: "stats loaded",
    error: "load error",
};

const LOAD_STATE_TONES: Record<LoadState, "success" | "warning" | "danger"> = {
    idle: "warning",
    loading: "warning",
    ready: "success",
    error: "danger",
};

export default function AdminDashboardScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();

    const [stats, setStats] = useState<ServerStatsResponse | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchServerStats(instanceUrl, accessToken, serverId);
            setStats(res);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load stats",
            );
        }
    }, [accessToken, instanceUrl, serverId]);

    useEffect(() => {
        void loadStats();
    }, [loadStats]);

    useRetryOnReconnect(loadState === "error", loadStats);

    return (
        <AuthRouteGuard>
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
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                >
                    <SafeAreaView style={styles.safeArea}>
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Admin dashboard
                            </ThemedText>
                            <ThemedText type="title">Server overview</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Quick stats and shortcuts for server administration.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill label="admin" tone="warning" />
                                <StatusPill
                                    label={LOAD_STATE_LABELS[loadState]}
                                    tone={LOAD_STATE_TONES[loadState]}
                                />
                            </View>
                        </ThemedView>

                        {/* Navigation */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Tools</ThemedText>
                            <View style={styles.toolGrid}>
                                {serverId ? (
                                    <>
                                        <ActionButton
                                            label="Moderation"
                                            tone="secondary"
                                            onPress={() =>
                                                router.push(
                                                    `/admin/reports?serverId=${encodeURIComponent(serverId)}` as never,
                                                )
                                            }
                                        />
                                        <ActionButton
                                            label="Audit log"
                                            tone="ghost"
                                            onPress={() =>
                                                router.push(
                                                    `/admin/audit-log?serverId=${encodeURIComponent(serverId)}` as never,
                                                )
                                            }
                                        />
                                    </>
                                ) : null}
                                <ActionButton
                                    label="Back"
                                    tone="ghost"
                                    onPress={() => router.back()}
                                />
                            </View>
                        </ThemedView>

                        {/* Stats */}
                        {!serverId ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText themeColor="mutedForeground">
                                    No server selected. Navigate to an admin page from within a server to view its statistics.
                                </ThemedText>
                            </ThemedView>
                        ) : null}

                        {loadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading stats…
                                </ThemedText>
                            </View>
                        ) : null}

                        {loadError ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText themeColor="destructive">
                                    {loadError}
                                </ThemedText>
                            </ThemedView>
                        ) : null}

                        {stats && loadState === "ready" ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText type="smallBold">Server statistics</ThemedText>
                                <View style={styles.statGrid}>
                                    <StatItem
                                        label="Members"
                                        value={stats.totalMembers}
                                    />
                                    <StatItem
                                        label="Channels"
                                        value={stats.totalChannels}
                                    />
                                    <StatItem
                                        label="Messages"
                                        value={stats.totalMessages}
                                    />
                                    <StatItem
                                        label="Recent messages"
                                        value={stats.recentMessages}
                                    />
                                    <StatItem
                                        label="Banned users"
                                        value={stats.bannedUsers}
                                        tone="danger"
                                    />
                                    <StatItem
                                        label="Muted users"
                                        value={stats.mutedUsers}
                                        tone="warning"
                                    />
                                </View>
                            </ThemedView>
                        ) : null}
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
        </View>
        </AuthRouteGuard>
    );
}

function StatItem({
    label,
    value,
    tone,
}: {
    label: string;
    value?: number;
    tone?: "neutral" | "danger" | "warning";
}) {
    return (
        <View style={styles.statItem}>
            <ThemedText type="code" themeColor="mutedForeground">
                {label}
            </ThemedText>
            <ThemedText type="subtitle">
                {value != null ? value.toLocaleString() : "—"}
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: "hidden" },
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -100,
        left: -80,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -140,
        bottom: 20,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
        paddingTop: Spacing.four,
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
    toolGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
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
    },
    actionButtonPressed: { opacity: 0.85 },
    statGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.three,
    },
    statItem: {
        minWidth: 120,
        gap: 4,
    },
});
