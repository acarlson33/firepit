import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
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
    fetchServerAuditLogs,
    type ServerAuditLogEntry,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

const LOAD_STATE_TONES: Record<LoadState, "success" | "warning" | "danger"> = {
    idle: "warning",
    loading: "warning",
    ready: "success",
    error: "danger",
};

function actionTone(action?: string): "neutral" | "success" | "warning" | "danger" {
    if (!action) return "neutral";
    const a = action.toLowerCase();
    if (a.includes("ban") && !a.includes("unban")) return "danger";
    if (a.includes("kick")) return "danger";
    if (a.includes("mute") && !a.includes("unmute")) return "warning";
    if (a.includes("unban") || a.includes("unmute")) return "success";
    if (a.includes("delete")) return "danger";
    if (a.includes("create") || a.includes("add")) return "success";
    return "neutral";
}

function formatTimestamp(timestamp?: string) {
    if (!timestamp) return "Unknown time";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString();
}

export default function AuditLogScreen() {
    const theme = useTheme();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [entries, setEntries] = useState<ServerAuditLogEntry[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadLogs = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchServerAuditLogs(
                instanceUrl,
                accessToken,
                serverId,
                50,
            );
            setEntries(res.items ?? []);
            setLoadState("ready");
        } catch (error) {
            setEntries([]);
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load audit logs",
            );
        }
    }, [accessToken, instanceUrl, serverId]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    useRetryOnReconnect(loadState === "error", loadLogs);

    if (!serverId) {
        return (
            <AuthRouteGuard>
                <View style={[styles.root, { backgroundColor: theme.background }]}>
                    <SafeAreaView style={styles.safeArea}>
                        <ThemedView style={styles.shell}>
                            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                <ThemedText type="title">No server selected</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={{ fontSize: 14, lineHeight: 20, marginTop: Spacing.one }}>
                                    Select a server from the admin dashboard to view its audit logs.
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => router.back()}
                                    style={({ pressed }) => [
                                        {
                                            borderRadius: 999,
                                            paddingHorizontal: Spacing.three,
                                            paddingVertical: Spacing.two,
                                            backgroundColor: theme.primary,
                                            marginTop: Spacing.three,
                                            alignItems: "center",
                                            opacity: pressed ? 0.85 : 1,
                                        },
                                    ]}
                                >
                                    <ThemedText type="smallBold" themeColor="primaryForeground">
                                        Go back
                                    </ThemedText>
                                </Pressable>
                            </ThemedView>
                        </ThemedView>
                    </SafeAreaView>
                </View>
            </AuthRouteGuard>
        );
    }

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Audit log
                            </ThemedText>
                            <ThemedText type="title">
                                Moderation history
                            </ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Review recent moderation actions and server changes.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${entries.length} entries`
                                            : "loading"
                                    }
                                    tone={LOAD_STATE_TONES[loadState]}
                                />
                            </View>
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">Actions</ThemedText>
                                <View style={styles.actionRow}>
                                    <ActionButton
                                        label="Dashboard"
                                        tone="ghost"
                                        onPress={() =>
                                            router.push(`/admin?serverId=${serverId}` as never)
                                        }
                                    />
                                    <ActionButton
                                        label="Moderation"
                                        tone="ghost"
                                        onPress={() =>
                                            router.push(`/admin/reports?serverId=${serverId}` as never)
                                        }
                                    />
                                    <ActionButton
                                        label="Refresh"
                                        tone="secondary"
                                        onPress={() => void loadLogs()}
                                    />
                                </View>
                            </View>
                            {loadError ? (
                                <ThemedText themeColor="destructive">
                                    {loadError}
                                </ThemedText>
                            ) : null}
                        </ThemedView>
                    </ThemedView>

                    {loadState === "loading" ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={theme.primary} />
                            <ThemedText themeColor="mutedForeground">
                                Loading audit logs…
                            </ThemedText>
                        </View>
                    ) : null}

                    <FlatList
                        data={entries}
                        keyExtractor={(item, index) =>
                            item.$id ?? `${item.timestamp}-${index}`
                        }
                        contentContainerStyle={styles.listContent}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                        removeClippedSubviews
                        ListEmptyComponent={
                            loadState === "ready" ? (
                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.card,
                                        styles.emptyCard,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText themeColor="mutedForeground">
                                        No audit log entries found.
                                    </ThemedText>
                                </ThemedView>
                            ) : null
                        }
                        renderItem={({ item }) => <AuditEntryCard entry={item} />}
                    />
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

function AuditEntryCard({ entry }: { entry: ServerAuditLogEntry }) {
    const theme = useTheme();
    const tone = actionTone(entry.action);

    return (
        <View style={styles.entryWrap}>
            <ThemedView
                type="card"
                style={[styles.entryCard, { borderColor: theme.border }]}
            >
                <View style={styles.entryHeader}>
                    <StatusPill
                        label={entry.action ?? "unknown"}
                        tone={tone}
                    />
                    <ThemedText type="code" themeColor="mutedForeground">
                        {formatTimestamp(entry.timestamp)}
                    </ThemedText>
                </View>

                <View style={styles.entryBody}>
                    <ThemedText>
                        <ThemedText type="smallBold">
                            {entry.moderatorName ?? entry.moderatorId ?? "System"}
                        </ThemedText>
                        {entry.targetUserId || entry.targetUserName ? (
                            <ThemedText>
                                {" "}
                                →{" "}
                                <ThemedText type="smallBold">
                                    {entry.targetUserName ?? entry.targetUserId}
                                </ThemedText>
                            </ThemedText>
                        ) : null}
                    </ThemedText>

                    {entry.reason ? (
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.entryReason}
                        >
                            Reason: {entry.reason}
                        </ThemedText>
                    ) : null}
                </View>
            </ThemedView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: "hidden" },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
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
    emptyCard: {
        marginTop: Spacing.three,
        alignItems: "center",
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    actionRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    listContent: {
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
        gap: Spacing.two,
    },
    entryWrap: {
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        width: "100%",
    },
    entryCard: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    entryHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    entryBody: { gap: 4 },
    entryReason: {
        fontSize: 13,
        lineHeight: 18,
    },
});
