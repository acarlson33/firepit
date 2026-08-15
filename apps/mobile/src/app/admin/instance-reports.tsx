import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
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
    fetchAdminReports,
    resolveReport,
    type AdminReportEntry,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

function statusTone(
    status?: string,
): "neutral" | "success" | "warning" | "danger" {
    if (status === "pending") return "warning";
    if (status === "resolved") return "success";
    if (status === "dismissed") return "neutral";
    return "neutral";
}

function formatTimestamp(timestamp?: string) {
    if (!timestamp) return "Unknown time";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString();
}

export default function InstanceReportsScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [reports, setReports] = useState<AdminReportEntry[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);

    const loadReports = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchAdminReports(instanceUrl, accessToken, 50);
            setReports(res.items ?? []);
            setNextCursor(res.nextCursor ?? null);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load reports",
            );
        }
    }, [accessToken, instanceUrl]);

    const loadMore = useCallback(async () => {
        if (!instanceUrl || !accessToken || !nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetchAdminReports(
                instanceUrl,
                accessToken,
                50,
                nextCursor,
            );
            setReports((prev) => [...prev, ...(res.items ?? [])]);
            setNextCursor(res.nextCursor ?? null);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Failed to load more reports",
            );
        } finally {
            setLoadingMore(false);
        }
    }, [accessToken, instanceUrl, nextCursor, loadingMore]);

    const handleResolve = useCallback(
        async (
            reportId: string,
            action: "resolve" | "dismiss",
        ) => {
            if (!instanceUrl || !accessToken) return;
            setSavingId(reportId);
            try {
                await resolveReport(instanceUrl, accessToken, reportId, action);
                setReports((prev) =>
                    prev.map((r) =>
                        r.$id === reportId
                            ? {
                                ...r,
                                status:
                                    action === "resolve"
                                        ? "resolved"
                                        : "dismissed",
                            }
                            : r,
                    ),
                );
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to resolve report";
                alert(message);
            } finally {
                setSavingId(null);
            }
        },
        [accessToken, instanceUrl],
    );

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    useRetryOnReconnect(loadState === "error", loadReports);

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
                                Reports
                            </ThemedText>
                            <ThemedText type="title">
                                User reports
                            </ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Review and act on reports submitted by users for
                                inappropriate profile content.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${reports.length} reports`
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
                                onPress={() => void loadReports()}
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
                                Loading reports…
                            </ThemedText>
                        </View>
                    ) : null}

                    <FlatList
                        data={reports}
                        keyExtractor={(item, index) =>
                            item.$id ?? item.createdAt ?? `report-${index}`
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
                                        No reports found.
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
                            <ReportCard
                                entry={item}
                                savingId={savingId}
                                onResolve={handleResolve}
                            />
                        )}
                    />
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

function ReportCard({
    entry,
    savingId,
    onResolve,
}: {
    entry: AdminReportEntry;
    savingId: string | null;
    onResolve: (reportId: string, action: "resolve" | "dismiss") => void;
}) {
    const theme = useTheme();
    const isPending = entry.status === "pending";
    const isSaving = savingId === entry.$id;

    const [resolutionNotes, setResolutionNotes] = useState("");

    return (
        <View style={styles.entryWrap}>
            <ThemedView
                type="card"
                style={[styles.entryCard, { borderColor: theme.border }]}
            >
                <View style={styles.entryHeader}>
                    <StatusPill
                        label={entry.status ?? "unknown"}
                        tone={statusTone(entry.status)}
                    />
                    <ThemedText type="code" themeColor="mutedForeground">
                        {formatTimestamp(entry.createdAt)}
                    </ThemedText>
                </View>

                <View style={styles.entryBody}>
                    <ThemedText>
                        <ThemedText type="smallBold">Reported user:</ThemedText>{" "}
                        {entry.reportedUserName ?? entry.reportedUserId ?? "Unknown"}
                    </ThemedText>
                    <ThemedText>
                        <ThemedText type="smallBold">Reporter:</ThemedText>{" "}
                        {entry.reporterName ?? entry.reporterId ?? "Unknown"}
                    </ThemedText>
                    {entry.justification ? (
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.justification}
                        >
                            {entry.justification}
                        </ThemedText>
                    ) : null}
                    {entry.status !== "pending" && entry.resolvedByName ? (
                        <ThemedText>
                            <ThemedText type="smallBold">Resolved by:</ThemedText>{" "}
                            {entry.resolvedByName}
                        </ThemedText>
                    ) : null}
                    {entry.status !== "pending" && entry.resolutionNotes ? (
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.justification}
                        >
                            {entry.resolutionNotes}
                        </ThemedText>
                    ) : null}
                </View>

                {isPending ? (
                    <View style={styles.actionSection}>
                        <ThemedText type="code" themeColor="mutedForeground">
                            Take action
                        </ThemedText>
                        <TextInput
                            style={[
                                styles.notesInput,
                                {
                                    backgroundColor: theme.secondary,
                                    borderColor: theme.border,
                                    color: theme.foreground,
                                },
                            ]}
                            placeholder="Resolution notes (optional)"
                            placeholderTextColor={theme.mutedForeground}
                            value={resolutionNotes}
                            onChangeText={setResolutionNotes}
                        />
                        <View style={styles.actionRow}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving}
                                onPress={() => {
                                    if (entry.$id) onResolve(entry.$id, "resolve");
                                }}
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    styles.resolveButton,
                                    {
                                        backgroundColor: theme.secondary,
                                        opacity: pressed || isSaving ? 0.7 : 1,
                                    },
                                ]}
                            >
                                {isSaving ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={theme.foreground}
                                    />
                                ) : (
                                    <ThemedText type="smallBold">
                                        Resolve
                                    </ThemedText>
                                )}
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving}
                                onPress={() => {
                                    if (entry.$id) onResolve(entry.$id, "dismiss");
                                }}
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    styles.dismissButton,
                                    {
                                        borderColor: theme.border,
                                        opacity: pressed || isSaving ? 0.7 : 1,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold" themeColor="mutedForeground">
                                    Dismiss
                                </ThemedText>
                            </Pressable>
                        </View>
                    </View>
                ) : null}
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
    justification: {
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: Spacing.one,
    },
    actionSection: {
        borderTopWidth: 1,
        borderTopColor: "rgba(128,128,128,0.2)",
        paddingTop: Spacing.three,
        marginTop: Spacing.one,
        gap: Spacing.two,
    },
    notesInput: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 14,
        lineHeight: 20,
    },
    actionRow: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    actionButton: {
        flex: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        alignItems: "center",
    },
    resolveButton: {},
    dismissButton: {
        borderWidth: 1,
    },
});
