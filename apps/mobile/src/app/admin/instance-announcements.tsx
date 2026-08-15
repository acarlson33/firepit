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
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createAnnouncement,
    listAnnouncements,
    type Announcement,
    type AnnouncementStatus,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";
type Mode = "draft" | "schedule" | "send_now";
type Priority = "normal" | "urgent";

function statusTone(
    status?: AnnouncementStatus,
): "neutral" | "success" | "warning" | "danger" {
    switch (status) {
        case "sent":
            return "success";
        case "failed":
            return "danger";
        case "dispatching":
        case "scheduled":
            return "warning";
        default:
            return "neutral";
    }
}

function formatDate(value?: string): string {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString();
}

function previewBody(body: string): string {
    const trimmed = body.trim();
    return trimmed.length <= 220 ? trimmed : `${trimmed.slice(0, 220)}...`;
}

const FILTER_OPTIONS: Array<{ label: string; value: "all" | AnnouncementStatus }> = [
    { label: "All", value: "all" },
    { label: "Draft", value: "draft" },
    { label: "Scheduled", value: "scheduled" },
    { label: "Sent", value: "sent" },
    { label: "Failed", value: "failed" },
];

const MODE_OPTIONS: Array<{ label: string; value: Mode }> = [
    { label: "Draft", value: "draft" },
    { label: "Scheduled", value: "schedule" },
    { label: "Send now", value: "send_now" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: Priority }> = [
    { label: "Normal", value: "normal" },
    { label: "Urgent", value: "urgent" },
];

function PickerRow<T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<{ label: string; value: T }>;
    value: T;
    onChange: (v: T) => void;
}) {
    const theme = useTheme();
    return (
        <View style={styles.pickerRow}>
            {options.map((opt) => {
                const selected = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        onPress={() => onChange(opt.value)}
                        style={[
                            styles.pickerChip,
                            {
                                backgroundColor: selected
                                    ? theme.primary
                                    : theme.secondary,
                                borderColor: selected
                                    ? theme.primary
                                    : theme.border,
                            },
                        ]}
                    >
                        <ThemedText
                            type="smallBold"
                            themeColor={
                                selected ? "primaryForeground" : "foreground"
                            }
                        >
                            {opt.label}
                        </ThemedText>
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function InstanceAnnouncementsScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    // List state
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | AnnouncementStatus>("all");
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    // Compose state
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [mode, setMode] = useState<Mode>("draft");
    const [priority, setPriority] = useState<Priority>("normal");
    const [scheduledFor, setScheduledFor] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<string | null>(null);

    const loadAnnouncements = useCallback(
        async (cursorAfter?: string) => {
            if (!instanceUrl || !accessToken) return;
            if (cursorAfter) {
                setLoadingMore(true);
            } else {
                setLoadState("loading");
                setAnnouncements([]);
                setNextCursor(null);
            }
            setLoadError(null);

            try {
                const statuses =
                    filter === "all" ? undefined : [filter];
                const res = await listAnnouncements(
                    instanceUrl,
                    accessToken,
                    {
                        cursorAfter,
                        limit: 25,
                        statuses,
                    },
                );
                const items = res.items ?? [];
                if (cursorAfter) {
                    setAnnouncements((prev) => {
                        const existing = new Set(prev.map((a) => a.$id));
                        return [
                            ...prev,
                            ...items.filter((a) => !existing.has(a.$id)),
                        ];
                    });
                } else {
                    setAnnouncements(items);
                }
                setNextCursor(res.nextCursor ?? null);
                setLoadState("ready");
            } catch (error) {
                setLoadState("error");
                setLoadError(
                    error instanceof Error
                        ? error.message
                        : "Unable to load announcements",
                );
            } finally {
                setLoadingMore(false);
            }
        },
        [accessToken, instanceUrl, filter],
    );

    useEffect(() => {
        void loadAnnouncements();
    }, [loadAnnouncements]);

    useRetryOnReconnect(loadState === "error", loadAnnouncements);

    const handleSubmit = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        if (!body.trim()) {
            setSubmitResult("Message body is required");
            return;
        }

        setIsSubmitting(true);
        setSubmitResult(null);

        try {
            const res = await createAnnouncement(instanceUrl, accessToken, {
                body: body.trim(),
                mode,
                priority,
                scheduledFor:
                    mode === "schedule" && scheduledFor
                        ? new Date(scheduledFor).toISOString()
                        : undefined,
                title: title.trim() || undefined,
            });

            if (res.error) {
                setSubmitResult(res.error);
            } else {
                setBody("");
                setTitle("");
                setMode("draft");
                setPriority("normal");
                setScheduledFor("");
                setSubmitResult("Announcement created");
                void loadAnnouncements();
            }
        } catch (error) {
            setSubmitResult(
                error instanceof Error
                    ? error.message
                    : "Failed to create announcement",
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [
        accessToken,
        body,
        instanceUrl,
        loadAnnouncements,
        mode,
        priority,
        scheduledFor,
        title,
    ]);

    const listHeader = (
        <View style={styles.listGap}>
            {/* Hero */}
            <ThemedView
                type="card"
                style={[styles.heroCard, { borderColor: theme.border }]}
            >
                <ThemedText type="code" themeColor="accent">
                    Announcements
                </ThemedText>
                <ThemedText type="title">
                    Instance announcements
                </ThemedText>
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.copy}
                >
                    Compose, schedule, and send system announcements
                    to every profiled user through read-only DM
                    threads.
                </ThemedText>
                <View style={styles.pillRow}>
                    <StatusPill
                        label={
                            loadState === "ready"
                                ? `${announcements.length} announcements`
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

            {/* Compose form */}
            <ThemedView
                type="card"
                style={[styles.card, { borderColor: theme.border }]}
            >
                <ThemedText type="smallBold">
                    Compose announcement
                </ThemedText>

                <TextInput
                    style={[
                        styles.input,
                        {
                            backgroundColor: theme.secondary,
                            borderColor: theme.border,
                            color: theme.foreground,
                        },
                    ]}
                    placeholder="Title (optional)"
                    placeholderTextColor={theme.mutedForeground}
                    value={title}
                    onChangeText={setTitle}
                />

                <TextInput
                    style={[
                        styles.input,
                        styles.textArea,
                        {
                            backgroundColor: theme.secondary,
                            borderColor: theme.border,
                            color: theme.foreground,
                        },
                    ]}
                    placeholder="Message body (Markdown supported)"
                    placeholderTextColor={theme.mutedForeground}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    value={body}
                    onChangeText={setBody}
                />

                <ThemedText
                    type="code"
                    themeColor="mutedForeground"
                >
                    Mode
                </ThemedText>
                <PickerRow
                    options={MODE_OPTIONS}
                    value={mode}
                    onChange={setMode}
                />

                <ThemedText
                    type="code"
                    themeColor="mutedForeground"
                >
                    Priority
                </ThemedText>
                <PickerRow
                    options={PRIORITY_OPTIONS}
                    value={priority}
                    onChange={setPriority}
                />

                {mode === "schedule" ? (
                    <>
                        <ThemedText
                            type="code"
                            themeColor="mutedForeground"
                        >
                            Scheduled for
                        </ThemedText>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: theme.secondary,
                                    borderColor: theme.border,
                                    color: theme.foreground,
                                },
                            ]}
                            placeholder="YYYY-MM-DD HH:MM"
                            placeholderTextColor={
                                theme.mutedForeground
                            }
                            value={scheduledFor}
                            onChangeText={setScheduledFor}
                        />
                    </>
                ) : null}

                {submitResult ? (
                    <ThemedText
                        themeColor={
                            submitResult.includes("required") ||
                            submitResult.includes("Failed") ||
                            submitResult.includes("error")
                                ? "destructive"
                                : "accent"
                        }
                        style={styles.resultText}
                    >
                        {submitResult}
                    </ThemedText>
                ) : null}

                <View style={styles.submitRow}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isSubmitting}
                        onPress={() => void handleSubmit()}
                        style={({ pressed }) => [
                            styles.submitButton,
                            {
                                backgroundColor: theme.primary,
                                opacity:
                                    pressed || isSubmitting
                                        ? 0.7
                                        : 1,
                            },
                        ]}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator
                                size="small"
                                color={theme.primaryForeground}
                            />
                        ) : (
                            <ThemedText
                                type="smallBold"
                                themeColor="primaryForeground"
                            >
                                Create announcement
                            </ThemedText>
                        )}
                    </Pressable>
                </View>
            </ThemedView>

            {loadError ? (
                <ThemedView
                    type="card"
                    style={[
                        styles.card,
                        { borderColor: theme.border },
                    ]}
                >
                    <ThemedText themeColor="destructive">
                        {loadError}
                    </ThemedText>
                </ThemedView>
            ) : null}

            {loadState === "loading" ? (
                <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.primary} />
                    <ThemedText themeColor="mutedForeground">
                        Loading announcements…
                    </ThemedText>
                </View>
            ) : null}

            {/* List header + filter */}
            <ThemedText type="smallBold">
                Recent announcements
            </ThemedText>
            <View style={styles.filterRow}>
                {FILTER_OPTIONS.map((opt) => {
                    const selected = opt.value === filter;
                    return (
                        <Pressable
                            key={opt.value}
                            accessibilityRole="button"
                            onPress={() =>
                                setFilter(opt.value)
                            }
                            style={[
                                styles.filterChip,
                                {
                                    backgroundColor: selected
                                        ? theme.primary
                                        : theme.secondary,
                                    borderColor: selected
                                        ? theme.primary
                                        : theme.border,
                                },
                            ]}
                        >
                            <ThemedText
                                type="code"
                                themeColor={
                                    selected
                                        ? "primaryForeground"
                                        : "mutedForeground"
                                }
                            >
                                {opt.label}
                            </ThemedText>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <FlatList
                        data={announcements}
                        keyExtractor={(item) => item.$id}
                        contentContainerStyle={styles.listContent}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                        removeClippedSubviews
                        onEndReached={
                            nextCursor && !loadingMore
                                ? () => void loadAnnouncements(nextCursor)
                                : undefined
                        }
                        onEndReachedThreshold={0.5}
                        ListHeaderComponent={listHeader}
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
                                        No announcements found.
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
                            <AnnouncementCard item={item} />
                        )}
                    />
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

function AnnouncementCard({ item }: { item: Announcement }) {
    const theme = useTheme();
    return (
        <ThemedView
            type="card"
            style={[styles.entryCard, { borderColor: theme.border }]}
        >
            <View style={styles.entryHeader}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.entryTitle}>
                    {item.title || "Untitled announcement"}
                </ThemedText>
                <StatusPill
                    label={item.status}
                    tone={statusTone(item.status)}
                />
            </View>

            <ThemedText
                themeColor="mutedForeground"
                numberOfLines={3}
                style={styles.entryBody}
            >
                {previewBody(item.body)}
            </ThemedText>

            <View style={styles.entryMeta}>
                <ThemedText type="code" themeColor="mutedForeground">
                    Priority: {item.priority}
                </ThemedText>
                <ThemedText type="code" themeColor="mutedForeground">
                    Scheduled: {formatDate(item.scheduledFor)}
                </ThemedText>
                <ThemedText type="code" themeColor="mutedForeground">
                    Published: {formatDate(item.publishedAt)}
                </ThemedText>
                {item.deliverySummary ? (
                    <ThemedText type="code" themeColor="mutedForeground">
                        Delivered: {item.deliverySummary.delivered}/
                        {item.deliverySummary.attempted}
                    </ThemedText>
                ) : null}
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: "hidden" },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
    },
    listGap: {
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
    input: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 14,
        lineHeight: 20,
    },
    textArea: {
        minHeight: 100,
    },
    pickerRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    pickerChip: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderWidth: 1,
    },
    resultText: {
        fontSize: 13,
        lineHeight: 18,
    },
    submitRow: {
        alignItems: "flex-end",
    },
    submitButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.two,
    },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    filterChip: {
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderWidth: 1,
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
    entryTitle: {
        flex: 1,
    },
    entryBody: {
        fontSize: 14,
        lineHeight: 20,
    },
    entryMeta: {
        gap: 2,
    },
    emptyCard: {
        marginTop: Spacing.three,
        alignItems: "center",
    },
});
