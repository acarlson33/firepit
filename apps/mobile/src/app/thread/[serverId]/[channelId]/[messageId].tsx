import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import MessageWithMentions from "@/components/message-with-mentions";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createChannelThreadReply,
    fetchChannelThreadMessages,
    type TimelineMessage,
} from "@/lib/firepit";
import { cacheThreadReplies, getCachedThreadReplies, markAsThreadReply } from "@/lib/cache/ThreadCache";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    serverId?: string;
    channelId?: string;
    messageId?: string;
};

function normalizeParam(value?: string | string[]) {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function formatTime(createdAt?: string) {
    if (!createdAt) {
        return "now";
    }

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
        return "now";
    }

    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ThreadScreen() {
    const theme = useTheme();
    const { serverId, channelId, messageId } = useLocalSearchParams<RouteParams>();
    const { instanceUrl, accessToken, state } = useFirepitBootstrap();
    const normalizedServerId = normalizeParam(serverId);
    const normalizedChannelId = normalizeParam(channelId);
    const normalizedMessageId = normalizeParam(messageId);
    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);

    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [parentMessage, setParentMessage] = useState<TimelineMessage | null>(null);
    const [replies, setReplies] = useState<TimelineMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [sendState, setSendState] = useState<LoadState>("idle");
    const [sendError, setSendError] = useState<string | null>(null);

    const pageTitle = useMemo(
        () => (parentMessage?.text ? "Thread" : "Thread details"),
        [parentMessage?.text],
    );

    const loadThread = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedMessageId) {
            return;
        }

        setLoadState("loading");
        setError(null);

        try {
            // Show cached replies instantly
            const cachedReplies = await getCachedThreadReplies(normalizedMessageId);
            if (cachedReplies.length > 0) {
                setReplies(cachedReplies);
            }

            const response = await fetchChannelThreadMessages(
                instanceUrl,
                accessToken,
                normalizedMessageId,
            );
            const nextParent =
                (response.parentMessage as TimelineMessage | null | undefined) ??
                (response.message as TimelineMessage | null | undefined) ??
                null;
            const nextReplies = (response.items ?? response.replies ?? []) as TimelineMessage[];
            setParentMessage(nextParent);
            setReplies(nextReplies);
            // Cache replies and mark them as thread replies for main list filtering
            void cacheThreadReplies(normalizedMessageId, nextReplies);
            for (const r of nextReplies) {
                if (r.$id) void markAsThreadReply(r.$id);
            }
            setLoadState("ready");
        } catch (loadError) {
            setLoadState("error");
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load thread",
            );
        }
    }, [accessToken, instanceUrl, normalizedMessageId]);

    useEffect(() => {
        void loadThread();
    }, [loadThread]);

    useRetryOnReconnect(loadState === "error", loadThread);

    const sendReply = useCallback(async () => {
        if (
            !instanceUrl ||
            !accessToken ||
            !normalizedMessageId ||
            sendState === "loading"
        ) {
            return;
        }

        const text = draft.trim();
        if (!text) {
            return;
        }

        setSendState("loading");
        setSendError(null);

        try {
            await createChannelThreadReply(instanceUrl, accessToken, normalizedMessageId, {
                text,
            });
            setDraft("");
            setSendState("ready");
            await loadThread();
        } catch (sendReplyError) {
            setSendState("error");
            setSendError(
                sendReplyError instanceof Error
                    ? sendReplyError.message
                    : "Unable to send reply",
            );
        }
    }, [accessToken, draft, instanceUrl, loadThread, normalizedMessageId, sendState]);

    return (
        <AuthRouteGuard>
            <ScrollView
                style={[styles.scrollView, { backgroundColor: theme.background }]}
                contentContainerStyle={styles.scrollContent}
            >
                <SafeAreaView style={styles.safeArea}>
                    <ThemedView style={styles.shell}>
                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <ThemedText type="code" themeColor="accent">
                                Thread
                            </ThemedText>
                            <ThemedText type="title">{pageTitle}</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                View the parent message and reply directly in context.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill label={normalizedServerId ?? "unknown server"} tone="neutral" />
                                <StatusPill label={normalizedChannelId ?? "unknown channel"} tone="neutral" />
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${replies.length} replies`
                                            : "loading replies"
                                    }
                                    tone={
                                        loadState === "ready"
                                            ? "success"
                                            : loadState === "error"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                            </View>
                        </ThemedView>

                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">Navigation</ThemedText>
                                <Pressable accessibilityRole="button" onPress={() => router.back()}>
                                    <ThemedText type="smallBold">Back</ThemedText>
                                </Pressable>
                            </View>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Return to the original channel when you are done.
                            </ThemedText>
                        </ThemedView>

                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">Parent message</ThemedText>
                            {loadState === "loading" ? <ActivityIndicator /> : null}
                            {error ? <ThemedText themeColor="destructive">{error}</ThemedText> : null}
                            {!normalizedMessageId ? (
                                <ThemedText themeColor="mutedForeground">Missing message id.</ThemedText>
                            ) : null}
                            {parentMessage ? <ThreadMessageCard message={parentMessage} /> : null}
                        </ThemedView>

                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">Replies</ThemedText>
                            {replies.length === 0 && loadState === "ready" ? (
                                <ThemedText themeColor="mutedForeground">No replies yet.</ThemedText>
                            ) : null}
                            <View style={styles.list}>
                                {replies.map((reply) => (
                                    <ThreadMessageCard
                                        key={reply.$id ?? reply.$createdAt}
                                        message={reply}
                                    />
                                ))}
                            </View>
                        </ThemedView>

                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">Reply</ThemedText>
                            <TextInput
                                editable={signedIn && sendState !== "loading"}
                                multiline
                                placeholder="Write a reply"
                                placeholderTextColor={theme.mutedForeground}
                                value={draft}
                                onChangeText={setDraft}
                                style={[
                                    styles.input,
                                    { borderColor: theme.border, color: theme.foreground },
                                ]}
                            />
                            {sendError ? <ThemedText themeColor="destructive">{sendError}</ThemedText> : null}
                            <Pressable
                                accessibilityRole="button"
                                onPress={sendReply}
                                style={({ pressed }) => [
                                    styles.button,
                                    {
                                        backgroundColor: theme.primary,
                                        opacity: pressed ? 0.88 : 1,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryForeground">
                                    {sendState === "loading" ? "Sending…" : "Send reply"}
                                </ThemedText>
                            </Pressable>
                        </ThemedView>
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
        </AuthRouteGuard>
    );
}

function ThreadMessageCard({ message }: { message: TimelineMessage }) {
    return (
        <ThemedView type="secondary" style={styles.messageCard}>
            <View style={styles.messageHeader}>
                <ThemedText type="smallBold">
                    {message.userName ?? message.userId ?? "Unknown user"}
                </ThemedText>
                {message.$createdAt ? (
                    <ThemedText type="code" themeColor="mutedForeground">
                        {formatTime(message.$createdAt)}
                    </ThemedText>
                ) : null}
            </View>
            <MessageWithMentions text={message.text ?? ""} />
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
    return (
        <ThemedView type={tone === "neutral" ? "muted" : tone} style={styles.pill}>
            <ThemedText type="code" themeColor={tone === "neutral" ? "mutedForeground" : "foreground"}>
                {label}
            </ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    safeArea: {
        flex: 1,
        paddingBottom: BottomTabInset + Spacing.four,
        paddingHorizontal: Spacing.three,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
        paddingTop: Spacing.four,
    },
    card: {
        borderRadius: 22,
        borderWidth: 1,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    list: {
        gap: Spacing.two,
    },
    messageCard: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    messageHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    input: {
        minHeight: 120,
        borderWidth: 1,
        borderRadius: 16,
        padding: Spacing.three,
        textAlignVertical: "top",
    },
    button: {
        alignSelf: "flex-end",
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
});
