import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import MessageWithMentions from "@/components/message-with-mentions";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    fetchDirectMessageConversations,
    fetchDirectMessageMessages,
    sendDirectMessage,
    type DirectMessage,
    type DirectMessageConversation,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    conversationId?: string;
    messageId?: string;
};

function normalizeParam(value?: string | string[]) {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function hasId<T extends { $id?: string }>(item: T): item is T & { $id: string } {
    return typeof item.$id === "string" && item.$id.length > 0;
}

function formatTime(value?: string) {
    if (!value) {
        return "now";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "now";
    }

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

function conversationTitle(conversation: DirectMessageConversation | null) {
    if (!conversation) {
        return "Conversation";
    }

    if (conversation.name?.trim()) {
        return conversation.name.trim();
    }

    if (conversation.isGroup) {
        return `Group chat${conversation.participantCount ? ` · ${conversation.participantCount}` : ""}`;
    }

    return (
        conversation.otherUser?.displayName?.trim() ??
        conversation.otherUser?.userId ??
        "Direct message"
    );
}

function conversationSubtitle(conversation: DirectMessageConversation | null) {
    if (!conversation) {
        return "Loading conversation details";
    }

    if (conversation.readOnly) {
        return conversation.readOnlyReason ?? "Replies are disabled";
    }

    if (conversation.otherUser?.pronouns) {
        return conversation.otherUser.pronouns;
    }

    if (conversation.isGroup) {
        return conversation.participantCount
            ? `${conversation.participantCount} participants`
            : "Group conversation";
    }

    return conversation.participants?.length
        ? `${conversation.participants.length} participants`
        : "Direct conversation";
}

export default function DirectMessageScreen() {
    const theme = useTheme();
    const { conversationId, messageId } = useLocalSearchParams<RouteParams>();
    const normalizedConversationId = normalizeParam(conversationId);
    const normalizedMessageId = normalizeParam(messageId);
    const { instanceUrl, accessToken, currentUser, state } = useFirepitBootstrap();
    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken && currentUser);

    const [conversationLoadState, setConversationLoadState] = useState<LoadState>("idle");
    const [conversationError, setConversationError] = useState<string | null>(null);
    const [conversation, setConversation] = useState<DirectMessageConversation | null>(null);
    const [messagesLoadState, setMessagesLoadState] = useState<LoadState>("idle");
    const [messagesError, setMessagesError] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [sendState, setSendState] = useState<LoadState>("idle");
    const [sendError, setSendError] = useState<string | null>(null);
    const listRef = useRef<FlatList<DirectMessage>>(null);

    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const otherUserId = useMemo(() => {
        if (!conversation || conversation.isGroup) {
            return null;
        }

        return conversation.participants?.find((id) => id !== currentUserId) ?? null;
    }, [conversation, currentUserId]);
    const title = conversationTitle(conversation);
    const subtitle = conversationSubtitle(conversation);
    const messageIndex = useMemo(() => {
        if (!normalizedMessageId) {
            return -1;
        }

        return messages.findIndex((item) => item.$id === normalizedMessageId);
    }, [messages, normalizedMessageId]);

    const loadConversation = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedConversationId) {
            return;
        }

        setConversationLoadState("loading");
        setConversationError(null);

        try {
            const response = await fetchDirectMessageConversations(
                instanceUrl,
                accessToken,
            );
            const nextConversation = (response.conversations ?? []).find(
                (item) => item.$id === normalizedConversationId,
            );
            setConversation(nextConversation ?? null);
            setConversationLoadState("ready");
            if (!nextConversation) {
                setConversationError("Conversation not found");
            }
        } catch (loadError) {
            setConversationLoadState("error");
            setConversationError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load conversation",
            );
        }
    }, [accessToken, instanceUrl, normalizedConversationId]);

    const loadMessages = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedConversationId) {
            return;
        }

        setMessagesLoadState("loading");
        setMessagesError(null);

        try {
            const response = await fetchDirectMessageMessages(
                instanceUrl,
                accessToken,
                normalizedConversationId,
                100,
            );
            setMessages((response.items ?? []).filter(hasId));
            setMessagesLoadState("ready");
        } catch (loadError) {
            setMessagesLoadState("error");
            setMessagesError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load messages",
            );
        }
    }, [accessToken, instanceUrl, normalizedConversationId]);

    useEffect(() => {
        void loadConversation();
    }, [loadConversation]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        if (messageIndex >= 0 && listRef.current) {
            requestAnimationFrame(() => {
                listRef.current?.scrollToIndex({
                    index: messageIndex,
                    animated: false,
                    viewPosition: 0.5,
                });
            });
        }
    }, [messageIndex]);

    const sendMessage = useCallback(async () => {
        if (
            !instanceUrl ||
            !accessToken ||
            !normalizedConversationId ||
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
            await sendDirectMessage(instanceUrl, accessToken, {
                conversationId: normalizedConversationId,
                senderId: currentUserId ?? undefined,
                receiverId: otherUserId ?? undefined,
                text,
            });
            setDraft("");
            setSendState("ready");
            await loadMessages();
        } catch (sendError) {
            setSendState("error");
            setSendError(
                sendError instanceof Error ? sendError.message : "Unable to send message",
            );
        }
    }, [
        accessToken,
        currentUserId,
        draft,
        instanceUrl,
        loadMessages,
        normalizedConversationId,
        otherUserId,
        sendState,
    ]);

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <FlatList
                        ref={listRef}
                        data={messages}
                        inverted
                        keyExtractor={(item, index) =>
                            item.$id ?? `${item.conversationId}-${item.$createdAt}-${index}`
                        }
                        contentContainerStyle={styles.listContent}
                        ListHeaderComponent={
                            <ThemedView style={styles.shell}>
                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.heroCard,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText type="code" themeColor="accent">
                                        Direct message
                                    </ThemedText>
                                    <ThemedText type="title">{title}</ThemedText>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        {subtitle}
                                    </ThemedText>
                                    <View style={styles.metaRow}>
                                        <StatusPill
                                            label={
                                                messagesLoadState === "ready"
                                                    ? `${messages.length} messages`
                                                    : "loading messages"
                                            }
                                            tone={
                                                messagesLoadState === "ready"
                                                    ? "success"
                                                    : messagesLoadState === "error"
                                                      ? "danger"
                                                      : "warning"
                                            }
                                        />
                                        <StatusPill
                                            label={
                                                conversation?.isGroup
                                                    ? "group"
                                                    : conversation?.otherUser?.displayName ??
                                                      conversation?.otherUser?.userId ??
                                                      "direct"
                                            }
                                            tone="neutral"
                                        />
                                        {normalizedMessageId ? (
                                            <StatusPill
                                                label={normalizedMessageId}
                                                tone="warning"
                                            />
                                        ) : null}
                                    </View>
                                </ThemedView>

                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <View style={styles.sectionHeaderRow}>
                                        <ThemedText type="smallBold">
                                            Conversation details
                                        </ThemedText>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => router.back()}
                                            style={({ pressed }) => [
                                                styles.inlineButton,
                                                {
                                                    backgroundColor: theme.muted,
                                                    borderColor: theme.border,
                                                    opacity: pressed ? 0.88 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor="foreground"
                                            >
                                                Back
                                            </ThemedText>
                                        </Pressable>
                                    </View>
                                    {conversationError ? (
                                        <ThemedText themeColor="destructive">
                                            {conversationError}
                                        </ThemedText>
                                    ) : null}
                                    {messagesError ? (
                                        <ThemedText themeColor="destructive">
                                            {messagesError}
                                        </ThemedText>
                                    ) : null}
                                    {conversation?.otherUser?.userId ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() =>
                                                router.push(
                                                    `/user/${encodeURIComponent(conversation.otherUser!.userId)}` as never,
                                                )
                                            }
                                            style={({ pressed }) => [
                                                styles.inlineButton,
                                                {
                                                    backgroundColor: theme.muted,
                                                    borderColor: theme.border,
                                                    opacity: pressed ? 0.88 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor="foreground"
                                            >
                                                View profile
                                            </ThemedText>
                                        </Pressable>
                                    ) : null}
                                </ThemedView>

                                {messagesLoadState === "loading" ? (
                                    <View style={styles.loadingRow}>
                                        <ActivityIndicator color={theme.primary} />
                                        <ThemedText themeColor="mutedForeground">
                                            Loading messages…
                                        </ThemedText>
                                    </View>
                                ) : null}
                            </ThemedView>
                        }
                        renderItem={({ item }) => (
                            <MessageRow
                                message={item}
                                isMine={Boolean(
                                    currentUserId && item.senderId && item.senderId === currentUserId,
                                )}
                                highlight={item.$id === normalizedMessageId}
                            />
                        )}
                        ListEmptyComponent={
                            messagesLoadState === "ready" ? (
                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <ThemedText type="smallBold">
                                        No messages yet
                                    </ThemedText>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        Say hello to start the conversation.
                                    </ThemedText>
                                </ThemedView>
                            ) : null
                        }
                    />

                    <ThemedView
                        type="card"
                        style={[styles.composerCard, { borderColor: theme.border }]}
                    >
                        <TextInput
                            editable={signedIn && !conversation?.readOnly}
                            multiline
                            placeholder={conversation?.readOnly ? conversation.readOnlyReason ?? "Replies are disabled" : "Write a message"}
                            placeholderTextColor={theme.mutedForeground}
                            value={draft}
                            onChangeText={setDraft}
                            style={[
                                styles.input,
                                { borderColor: theme.border, color: theme.foreground },
                            ]}
                        />
                        {sendError ? (
                            <ThemedText themeColor="destructive">
                                {sendError}
                            </ThemedText>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            disabled={!signedIn || conversation?.readOnly || sendState === "loading"}
                            onPress={() => void sendMessage()}
                            style={({ pressed }) => [
                                styles.sendButton,
                                {
                                    backgroundColor: theme.primary,
                                    opacity:
                                        !signedIn || conversation?.readOnly || sendState === "loading"
                                            ? 0.55
                                            : pressed
                                              ? 0.88
                                              : 1,
                                },
                            ]}
                        >
                            <ThemedText type="smallBold" themeColor="primaryForeground">
                                {sendState === "loading" ? "Sending…" : "Send"}
                            </ThemedText>
                        </Pressable>
                    </ThemedView>
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

function MessageRow({
    message,
    isMine,
    highlight,
}: {
    message: DirectMessage;
    isMine: boolean;
    highlight?: boolean;
}) {
    const theme = useTheme();
    const senderLabel = message.senderId ?? "Unknown sender";

    return (
        <ThemedView
            type="card"
            style={[
                styles.messageCard,
                isMine && styles.messageMine,
                highlight && styles.messageHighlight,
                { borderColor: theme.border },
            ]}
        >
            <View style={styles.messageTopRow}>
                <ThemedText type="smallBold">{senderLabel}</ThemedText>
                <ThemedText type="code" themeColor="mutedForeground">
                    {formatTime(message.$createdAt)}
                </ThemedText>
            </View>
            <MessageWithMentions text={message.text ?? ""} />
            {message.imageUrl ? (
                <Image
                    source={{ uri: message.imageUrl }}
                    style={styles.inlineImage}
                    contentFit="cover"
                />
            ) : null}
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
            <ThemedText
                type="code"
                themeColor={tone === "neutral" ? "mutedForeground" : "foreground"}
            >
                {label}
            </ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
    },
    listContent: {
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    heroCard: {
        borderWidth: 1,
        borderRadius: 24,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    card: {
        borderWidth: 1,
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    composerCard: {
        borderWidth: 1,
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        marginTop: Spacing.three,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    inlineButton: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        alignSelf: "flex-start",
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    input: {
        minHeight: 88,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        textAlignVertical: "top",
    },
    sendButton: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    messageCard: {
        borderWidth: 1,
        borderRadius: 18,
        padding: Spacing.three,
        marginTop: Spacing.three,
        gap: Spacing.one,
    },
    messageMine: {
        opacity: 0.98,
    },
    messageHighlight: {
        borderWidth: 2,
    },
    messageTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    inlineImage: {
        width: "100%",
        height: 220,
        borderRadius: 16,
        marginTop: Spacing.one,
    },
});
