import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ChatBubbleMessage } from "@/components/chat-bubble-message";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createDMThreadReply,
    fetchDMThreadMessages,
    type TimelineMessage,
} from "@/lib/firepit";
import { cacheThreadReplies, getCachedThreadReplies, markAsThreadReply } from "@/lib/cache/ThreadCache";
import { getProfilesBatch } from "@/lib/profile-cache";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { ArrowLeft } from "lucide-react-native";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    conversationId?: string;
    messageId?: string;
};

function normalizeParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0];
    return value;
}

export default function DMThreadScreen() {
    const theme = useTheme();
    const { conversationId, messageId } = useLocalSearchParams<RouteParams>();
    const { instanceUrl, accessToken, state, customEmojis, currentUser } = useFirepitBootstrap();
    const normalizedConversationId = normalizeParam(conversationId);
    const normalizedMessageId = normalizeParam(messageId);
    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);
    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;

    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [parentMessage, setParentMessage] = useState<TimelineMessage | null>(null);
    const [replies, setReplies] = useState<TimelineMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [sendState, setSendState] = useState<LoadState>("idle");
    const [sendError, setSendError] = useState<string | null>(null);

    const loadThread = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedMessageId) return;

        setLoadState("loading");
        setError(null);

        try {
            // Show cached replies instantly
            const cachedReplies = await getCachedThreadReplies(normalizedMessageId);
            if (cachedReplies.length > 0) {
                setReplies(cachedReplies);
            }

            const response = await fetchDMThreadMessages(
                instanceUrl,
                accessToken,
                normalizedMessageId,
            );
            const nextParent =
                (response.parentMessage as TimelineMessage | null | undefined) ??
                (response.message as TimelineMessage | null | undefined) ??
                null;
            const nextReplies = (response.replies ?? response.items ?? []) as TimelineMessage[];

            // Enrich with sender display names and avatars
            const senderIds = new Set<string>();
            if (nextParent?.senderId) senderIds.add(nextParent.senderId);
            for (const r of nextReplies) {
                if (r.senderId) senderIds.add(r.senderId);
            }
            if (senderIds.size > 0) {
                try {
                    const map = await getProfilesBatch(instanceUrl, accessToken, Array.from(senderIds));
                    const enrich = (msg: TimelineMessage): TimelineMessage => {
                        const profile = map[msg.senderId ?? ""];
                        if (!profile) return msg;
                        return {
                            ...msg,
                            userName: profile.displayName ?? msg.userName,
                            authorAvatarUrl: profile.avatarUrl ?? msg.authorAvatarUrl,
                        };
                    };
                    setParentMessage(nextParent ? enrich(nextParent) : null);
                    const enrichedReplies = nextReplies.map(enrich);
                    setReplies(enrichedReplies);
                    // Cache replies and mark them as thread replies for main list filtering
                    void cacheThreadReplies(normalizedMessageId, enrichedReplies);
                    for (const r of enrichedReplies) {
                        if (r.$id) void markAsThreadReply(r.$id);
                    }
                    setLoadState("ready");
                    return;
                } catch {
                    // ignore enrichment failure, fall through
                }
            }
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
        )
            return;

        const text = draft.trim();
        if (!text) return;

        setSendState("loading");
        setSendError(null);

        try {
            await createDMThreadReply(instanceUrl, accessToken, normalizedMessageId, {
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

    const allMessages = parentMessage ? [parentMessage, ...replies] : replies;

    const renderItem = useCallback(
        ({ item, index }: { item: TimelineMessage; index: number }) => {
            const isParent = index === 0 && item.$id === parentMessage?.$id;
            const mappedEmojis = customEmojis?.map((ce) => ({
                ...ce,
                url: ce.url.startsWith("http") ? ce.url : `${instanceUrl}${ce.url}`,
            })) ?? [];
            return (
                <View style={[
                    isParent ? styles.parentMessage : undefined,
                ]}>
                    {isParent && (
                        <View style={styles.parentLabel}>
                            <ThemedText
                                type="code"
                                themeColor="mutedForeground"
                            >
                                Parent message
                            </ThemedText>
                        </View>
                    )}
                    <ChatBubbleMessage
                        messageId={item.$id ?? String(index)}
                        authorId={item.senderId ?? item.userId ?? ""}
                        authorName={
                            item.userName ??
                            item.displayName ??
                            item.senderId ??
                            "Unknown"
                        }
                        authorAvatarUrl={
                            typeof item.authorAvatarUrl === "string"
                                ? item.authorAvatarUrl
                                : null
                        }
                        text={item.text ?? ""}
                        createdAt={item.$createdAt}
                        isMine={Boolean(
                            currentUserId &&
                                (item.senderId ?? item.userId) === currentUserId,
                        )}
                        customEmojis={mappedEmojis}
                    />
                </View>
            );
        },
        [parentMessage, customEmojis, instanceUrl, currentUserId],
    );

    return (
        <AuthRouteGuard>
            <KeyboardAvoidingView
                style={[styles.root, { backgroundColor: theme.background }]}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? BottomTabInset + 50 : 0}
            >
                <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: theme.border }]}>
                        <View style={styles.headerLeft}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={styles.backButton}
                            >
                                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.one }}>
                  <ArrowLeft size={18} color={theme.foreground} />
                  <ThemedText type="smallBold">Back</ThemedText>
                </View>
                            </Pressable>
                        </View>
                        <View style={styles.headerCenter}>
                            <ThemedText type="smallBold" numberOfLines={1}>
                                Thread &middot; {replies.length} {replies.length === 1 ? "reply" : "replies"}
                            </ThemedText>
                        </View>
                        <View style={styles.headerRight} />
                    </View>

                    {/* Messages */}
                    <View style={styles.messageArea}>
                        {loadState === "loading" && replies.length === 0 ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator />
                            </View>
                        ) : null}
                        {error ? (
                            <ThemedText themeColor="destructive" style={styles.errorText}>
                                {error}
                            </ThemedText>
                        ) : null}

                        <FlatList
                            data={allMessages}
                            inverted
                            keyExtractor={(item, idx) =>
                                item.$id ?? `${item.$createdAt}-${idx}`
                            }
                            renderItem={renderItem}
                            windowSize={5}
                            maxToRenderPerBatch={10}
                            initialNumToRender={15}
                            removeClippedSubviews
                            contentContainerStyle={styles.messageList}
                            style={styles.messageListContainer}
                        />
                    </View>

                    {/* Composer */}
                    <View
                        style={[
                            styles.composer,
                            { borderTopColor: theme.border, backgroundColor: theme.background },
                        ]}
                    >
                        {sendError ? (
                            <ThemedText themeColor="destructive" style={styles.sendError}>
                                {sendError}
                            </ThemedText>
                        ) : null}
                        <View style={styles.composerRow}>
                            <TextInput
                                editable={signedIn && sendState !== "loading"}
                                multiline
                                placeholder="Reply to thread"
                                placeholderTextColor={theme.mutedForeground}
                                value={draft}
                                onChangeText={setDraft}
                                style={[
                                    styles.input,
                                    { borderColor: theme.border, color: theme.foreground },
                                ]}
                            />
                            <Pressable
                                accessibilityRole="button"
                                onPress={sendReply}
                                disabled={!draft.trim() || sendState === "loading"}
                                style={({ pressed }) => [
                                    styles.sendButton,
                                    {
                                        backgroundColor: theme.primary,
                                        opacity: pressed || !draft.trim() ? 0.6 : 1,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryForeground">
                                    {sendState === "loading" ? "…" : "Send"}
                                </ThemedText>
                            </Pressable>
                        </View>
                    </View>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: Spacing.two,
    },
    headerLeft: { flexShrink: 0 },
    headerCenter: {
        flex: 1,
        minWidth: 0,
        gap: 1,
    },
    headerRight: { flexShrink: 0, width: 60 },
    backButton: {
        paddingVertical: Spacing.one,
    },
    messageArea: { flex: 1 },
    loadingContainer: {
        padding: Spacing.four,
        alignItems: "center",
    },
    errorText: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    parentLabel: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        alignItems: "center",
    },
    parentMessage: {
        borderBottomWidth: 2,
        borderBottomColor: "rgba(128,128,128,0.15)",
        paddingBottom: Spacing.two,
        marginBottom: Spacing.two,
    },
    messageListContainer: { flex: 1 },
    messageList: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
    },
    composer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
    },
    composerRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: Spacing.one,
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    sendButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        alignSelf: "flex-end",
        minWidth: 60,
        alignItems: "center",
    },
    sendError: {
        paddingHorizontal: Spacing.one,
    },
});
