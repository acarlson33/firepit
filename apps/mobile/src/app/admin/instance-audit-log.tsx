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
import { StatusPill } from "@/components/action-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    fetchAdminAuditLogs,
    type AdminAuditLogEntry,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

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

export default function InstanceAuditLogScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadLogs = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchAdminAuditLogs(instanceUrl, accessToken, 50);
            setEntries(res.items ?? []);
            setNextCursor(res.nextCursor ?? null);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load audit logs",
            );
        }
    }, [accessToken, instanceUrl]);

    const loadMore = useCallback(async () => {
        if (!instanceUrl || !accessToken || !nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetchAdminAuditLogs(
                instanceUrl,
                accessToken,
                50,
                nextCursor,
            );
            setEntries((prev) => [...prev, ...(res.items ?? [])]);
            setNextCursor(res.nextCursor ?? null);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Failed to load more entries",
            );
        } finally {
            setLoadingMore(false);
        }
    }, [accessToken, instanceUrl, nextCursor, loadingMore]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    useRetryOnReconnect(loadState === "error", loadLogs);

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
                                Instance audit log
                            </ThemedText>
                            <ThemedText type="title">
                                Instance-wide events
                            </ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Every privileged action across all servers, in
                                chronological order.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${entries.length} entries`
                                            : "loading"
                                    }
                                    tone={
                                        loadState === "ready"
                                            ? "success"
                                            : loadState === "error"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                                <StatusPill label="instance" tone="warning" />
                            </View>
                        </ThemedView>

                        <View style={styles.refreshRow}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => void loadLogs()}
                                style={({ pressed }) => [
                                    styles.refreshButton,
                                    {
                                        backgroundColor: theme.secondary,
                                        opacity: pressed ? 0.85 : 1,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold">Refresh</ThemedText>
                            </Pressable>
                        </View>

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
                        onEndReached={nextCursor ? loadMore : undefined}
                        onEndReachedThreshold={0.5}
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
                        ListFooterComponent={
                            loadingMore ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator
                                        size="small"
                                        color={theme.primary}
                                    />
                                    <ThemedText themeColor="mutedForeground">
                                        Loading more…
                                    </ThemedText>
                                </View>
                            ) : null
                        }
                        renderItem={({ item }) => (
                            <InstanceAuditEntryCard entry={item} />
                        )}
                    />
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

function InstanceAuditEntryCard({
    entry,
}: {
    entry: AdminAuditLogEntry;
}) {
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
                            {entry.actorName ?? entry.actorId ?? "System"}
                        </ThemedText>
                        {entry.targetId || entry.targetName ? (
                            <ThemedText>
                                {" "}
                                →{" "}
                                <ThemedText type="smallBold">
                                    {entry.targetName ?? entry.targetId}
                                </ThemedText>
                            </ThemedText>
                        ) : null}
                    </ThemedText>
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
    refreshRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    refreshButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
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
});
