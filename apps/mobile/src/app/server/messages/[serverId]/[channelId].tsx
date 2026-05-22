import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import ChatInput from "@/components/chat-input";
import { ImageViewer } from "@/components/image-viewer";
import MessageWithMentions from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Channel, Message } from "@/lib/firepit";
import {
    createChannelMessage,
    fetchChannelMessages,
    fetchChannels,
    fetchServer,
} from "@/lib/firepit";
import { toggleReaction } from "@/lib/reactions-client";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function ServerMessageScreen() {
    const theme = useTheme();
    const { serverId, channelId } = useLocalSearchParams<{
        serverId?: string;
        channelId?: string;
    }>();
    const { instanceUrl, accessToken, currentUser, state } =
        useFirepitBootstrap();
    const [serverLoadState, setServerLoadState] = useState<LoadState>("idle");
    const [serverLoadError, setServerLoadError] = useState<string | null>(null);
    const [serverName, setServerName] = useState<string | null>(null);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [channelLoadState, setChannelLoadState] = useState<LoadState>("idle");
    const [channelLoadError, setChannelLoadError] = useState<string | null>(
        null,
    );
    const [messageLoadState, setMessageLoadState] = useState<LoadState>("idle");
    const [messageLoadError, setMessageLoadError] = useState<string | null>(
        null,
    );
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageDraft, setMessageDraft] = useState("");
    const [messageSendState, setMessageSendState] = useState<LoadState>("idle");
    const [messageError, setMessageError] = useState<string | null>(null);
    const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;
    const normalizedChannelId = Array.isArray(channelId)
        ? channelId[0]
        : channelId;
    const signedIn = Boolean(state === "ready" && accessToken && currentUser);

    const selectedChannel = useMemo(
        () =>
            channels.find((channel) => channel.$id === normalizedChannelId) ??
            null,
        [channels, normalizedChannelId],
    );

    const selectedChannelTone =
        selectedChannel?.type === "announcement"
            ? "warning"
            : selectedChannel?.type === "voice"
              ? "success"
              : "neutral";

    const loadServer = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }

        setServerLoadState("loading");
        setServerLoadError(null);

        try {
            const nextServer = await fetchServer(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setServerName(nextServer.server?.name ?? null);
            setServerLoadState("ready");
        } catch (error) {
            setServerLoadState("error");
            setServerLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load server",
            );
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    const loadChannels = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }

        setChannelLoadState("loading");
        setChannelLoadError(null);

        try {
            const nextChannels = await fetchChannels(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setChannels(nextChannels.channels ?? []);
            setChannelLoadState("ready");
        } catch (error) {
            setChannelLoadState("error");
            setChannelLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load channels",
            );
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    const loadMessages = useCallback(
        async (nextChannelId: string) => {
            if (!instanceUrl || !accessToken) {
                return;
            }

            setMessageLoadState("loading");
            setMessageLoadError(null);

            try {
                const nextMessages = await fetchChannelMessages(
                    instanceUrl,
                    accessToken,
                    nextChannelId,
                );
                setMessages(nextMessages.messages ?? []);
                setMessageLoadState("ready");
            } catch (error) {
                setMessageLoadState("error");
                setMessageLoadError(
                    error instanceof Error
                        ? error.message
                        : "Unable to load messages",
                );
            }
        },
        [accessToken, instanceUrl],
    );

    useEffect(() => {
        void loadServer();
    }, [loadServer]);

    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    useEffect(() => {
        if (!normalizedChannelId || !selectedChannel) {
            setMessages([]);
            setMessageLoadState("idle");
            setMessageLoadError(null);
            return;
        }

        void loadMessages(normalizedChannelId);
    }, [loadMessages, normalizedChannelId, selectedChannel]);

    const sendMessage = useCallback(async () => {
        if (
            !instanceUrl ||
            !accessToken ||
            !selectedChannel?.$id ||
            !normalizedServerId
        ) {
            return;
        }

        const text = messageDraft.trim();
        if (!text) {
            return;
        }

        setMessageSendState("loading");
        setMessageError(null);

        try {
            await createChannelMessage(instanceUrl, accessToken, {
                channelId: selectedChannel.$id,
                serverId: normalizedServerId,
                text,
            });
            setMessageDraft("");
            setMessageSendState("ready");
            await loadMessages(selectedChannel.$id);
        } catch (error) {
            setMessageSendState("error");
            setMessageError(
                error instanceof Error
                    ? error.message
                    : "Unable to send message",
            );
        }
    }, [
        accessToken,
        instanceUrl,
        loadMessages,
        messageDraft,
        normalizedServerId,
        selectedChannel,
    ]);

    useEffect(() => {
        setMessageDraft("");
        setMessageError(null);
        setMessageSendState("idle");
    }, [normalizedChannelId]);

    return (
        <AuthRouteGuard>
            <ScrollView
                style={[
                    styles.scrollView,
                    { backgroundColor: theme.background },
                ]}
                contentContainerStyle={styles.scrollContent}
            >
                <View
                    style={[
                        styles.backdrop,
                        { backgroundColor: theme.background },
                    ]}
                />
                <View
                    pointerEvents="none"
                    style={[
                        styles.backdropOrbTop,
                        { backgroundColor: "rgba(217, 121, 43, 0.14)" },
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
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Navigation</ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Return to the server page to pick a different
                                channel.
                            </ThemedText>
                            <ThemedView
                                type="secondary"
                                style={styles.backLink}
                            >
                                <ThemedText
                                    type="smallBold"
                                    onPress={() => {
                                        if (!normalizedServerId) {
                                            return;
                                        }

                                        router.replace(
                                            `/server/${normalizedServerId}`,
                                        );
                                    }}
                                >
                                    Back to server browser
                                </ThemedText>
                            </ThemedView>
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[
                                styles.heroCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Channel messages
                            </ThemedText>
                            <ThemedText type="subtitle">
                                {selectedChannel?.name ??
                                    normalizedChannelId ??
                                    "Unknown channel"}
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Newest messages load first so the latest
                                conversation is visible immediately.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        serverName ??
                                        normalizedServerId ??
                                        "unknown server"
                                    }
                                    tone={
                                        serverLoadState === "ready"
                                            ? "success"
                                            : "warning"
                                    }
                                />
                                <StatusPill
                                    label={
                                        selectedChannel?.type ??
                                        (channelLoadState === "ready"
                                            ? "text"
                                            : "loading")
                                    }
                                    tone={selectedChannelTone}
                                />
                                <StatusPill
                                    label={
                                        messageLoadState === "ready"
                                            ? `${messages.length} messages`
                                            : "loading messages"
                                    }
                                    tone={
                                        messageLoadState === "ready"
                                            ? "success"
                                            : messageLoadState === "error"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                            </View>
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">
                                    Message timeline
                                </ThemedText>
                            </View>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Read the latest conversation without scrolling
                                through the channel list.
                            </ThemedText>

                            {messageLoadState === "loading" ? (
                                <ThemedText themeColor="mutedForeground">
                                    Loading messages…
                                </ThemedText>
                            ) : null}
                            {messageLoadError ? (
                                <ThemedText themeColor="destructive">
                                    {messageLoadError}
                                </ThemedText>
                            ) : null}
                            {messageError ? (
                                <ThemedText themeColor="destructive">
                                    {messageError}
                                </ThemedText>
                            ) : null}

                            {selectedChannel ? (
                                <View style={styles.timelineBlock}>
                                    {messageLoadState === "loading" ? null : (
                                        <FlatList
                                            data={messages}
                                            inverted
                                            keyExtractor={(message, index) =>
                                                message.$id ??
                                                `${message.channelId}-${message.$createdAt}-${index}`
                                            }
                                            renderItem={({ item: message }) => (
                                                <MessageCard
                                                    message={message}
                                                    isMine={Boolean(
                                                        message.userId &&
                                                        currentUser &&
                                                        message.userId ===
                                                            (currentUser.$id ??
                                                                currentUser.userId),
                                                    )}
                                                    onOpenImageViewer={(
                                                        url?: string,
                                                    ) =>
                                                        setViewerImageUrl(
                                                            url ?? null,
                                                        )
                                                    }
                                                    onToggleReaction={async (
                                                        emoji: string,
                                                        isAdding: boolean,
                                                    ) => {
                                                        try {
                                                            const msgId =
                                                                message.$id ??
                                                                (message as any)
                                                                    .id;
                                                            if (!msgId) {
                                                                return;
                                                            }

                                                            await toggleReaction(
                                                                String(msgId),
                                                                emoji,
                                                                isAdding,
                                                                false,
                                                            );
                                                        } catch {
                                                            setMessageError(
                                                                "Unable to update reaction",
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <MessageWithMentions
                                                        text={
                                                            message.text ?? ""
                                                        }
                                                    />
                                                </MessageCard>
                                            )}
                                            ListEmptyComponent={
                                                <ThemedView
                                                    type="secondary"
                                                    style={styles.emptyTimeline}
                                                >
                                                    <ThemedText type="smallBold">
                                                        No messages yet
                                                    </ThemedText>
                                                    <ThemedText
                                                        themeColor="mutedForeground"
                                                        style={styles.copy}
                                                    >
                                                        Send the first message to
                                                        start the conversation.
                                                    </ThemedText>
                                                </ThemedView>
                                            }
                                            initialNumToRender={10}
                                            maxToRenderPerBatch={10}
                                            windowSize={5}
                                            nestedScrollEnabled
                                            showsVerticalScrollIndicator
                                            contentContainerStyle={
                                                styles.timelineList
                                            }
                                            style={styles.messageList}
                                        />
                                    )}

                                    <View style={styles.composerCard}>
                                        <ThemedText type="smallBold">
                                            New message
                                        </ThemedText>
                                        <ChatInput
                                            value={messageDraft}
                                            onChange={setMessageDraft}
                                            placeholder="Write a message to this channel"
                                            disabled={
                                                messageSendState === "loading"
                                            }
                                            onMentionsChange={() => {}}
                                            serverId={
                                                normalizedServerId ?? undefined
                                            }
                                            canMentionEveryone={false}
                                        />
                                        <View style={styles.composerActions}>
                                            <ActionButton
                                                label={
                                                    messageSendState ===
                                                    "loading"
                                                        ? "Sending…"
                                                        : "Send"
                                                }
                                                onPress={sendMessage}
                                                tone="primary"
                                            />
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Select a channel from the server page to
                                    open its messages.
                                </ThemedText>
                            )}
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">
                                Channel details
                            </ThemedText>
                            {selectedChannel ? (
                                <View style={styles.selectedPanel}>
                                    <View style={styles.pillRow}>
                                        <StatusPill
                                            label={
                                                selectedChannel.type ?? "text"
                                            }
                                            tone={selectedChannelTone}
                                        />
                                        {selectedChannel.isPrivate ? (
                                            <StatusPill
                                                label="private"
                                                tone="warning"
                                            />
                                        ) : null}
                                        {selectedChannel.memberCount != null ? (
                                            <StatusPill
                                                label={`${selectedChannel.memberCount} members`}
                                                tone="neutral"
                                            />
                                        ) : null}
                                    </View>
                                    {selectedChannel.topic ? (
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            style={styles.copy}
                                        >
                                            {selectedChannel.topic}
                                        </ThemedText>
                                    ) : (
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            style={styles.copy}
                                        >
                                            No topic is set for this channel
                                            yet.
                                        </ThemedText>
                                    )}
                                </View>
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Select a channel above to see its details.
                                </ThemedText>
                            )}
                        </ThemedView>
                    </ThemedView>
                    <ImageViewer
                        url={viewerImageUrl ?? undefined}
                        visible={Boolean(viewerImageUrl)}
                        onClose={() => setViewerImageUrl(null)}
                    />
                </SafeAreaView>
            </ScrollView>
        </AuthRouteGuard>
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
        <ThemedView
            type={tone === "neutral" ? "muted" : tone}
            style={styles.statusPill}
        >
            <ThemedText
                type="code"
                themeColor={
                    tone === "neutral" ? "mutedForeground" : "foreground"
                }
            >
                {label}
            </ThemedText>
        </ThemedView>
    );
}

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
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor:
                        tone === "primary"
                            ? theme.primary
                            : tone === "secondary"
                              ? theme.secondary
                              : theme.muted,
                    borderColor: theme.border,
                },
                pressed && styles.actionButtonPressed,
            ]}
        >
            <ThemedText
                type="smallBold"
                style={styles.actionButtonLabel}
                themeColor={
                    tone === "primary" ? "primaryForeground" : "foreground"
                }
            >
                {label}
            </ThemedText>
        </Pressable>
    );
}

function MessageCard({
    message,
    isMine,
    children,
    onOpenImageViewer,
    onToggleReaction,
}: {
    message: Message;
    isMine: boolean;
    children?: React.ReactNode;
    onOpenImageViewer?: (url?: string) => void;
    onToggleReaction?: (
        emoji: string,
        isAdding: boolean,
    ) => Promise<void> | void;
}) {
    const theme = useTheme();
    const imageUrl =
        typeof message.imageUrl === "string" ? message.imageUrl : null;
    const reactions = Array.isArray(message.reactions)
        ? (message.reactions as Array<{
              emoji: string;
              count: number;
              reactedByMe?: boolean;
          }>)
        : [];

    return (
        <ThemedView
            type={isMine ? "secondary" : "card"}
            style={[
                styles.messageCard,
                isMine && styles.messageCardMine,
                {
                    borderColor: isMine ? theme.primary : theme.border,
                },
            ]}
        >
            <View style={styles.messageHeader}>
                <ThemedText type="smallBold">
                    {message.userName ?? message.userId ?? "Unknown user"}
                </ThemedText>
                {message.local ? (
                    <StatusPill label="local" tone="warning" />
                ) : null}
            </View>
            {children ? (
                <>{children}</>
            ) : (
                <ThemedText style={styles.messageBody}>
                    {message.text ?? ""}
                </ThemedText>
            )}

            {imageUrl ? (
                <Pressable
                    onPress={() => onOpenImageViewer?.(imageUrl)}
                    style={{ marginTop: Spacing.one }}
                >
                    <Image
                        source={{ uri: imageUrl }}
                        style={{ width: 200, height: 120, borderRadius: 8 }}
                    />
                </Pressable>
            ) : null}

            {reactions.length > 0 ? (
                <View style={{ flexDirection: "row", marginTop: Spacing.one }}>
                    {reactions.map((reaction) => (
                        <ReactionButton
                            key={`${message.$id}-${reaction.emoji}`}
                            reaction={reaction}
                            onToggle={(emoji, adding) =>
                                onToggleReaction?.(emoji, adding)
                            }
                        />
                    ))}
                </View>
            ) : null}
            <View style={styles.messageFooter}>
                {message.$createdAt ? (
                    <ThemedText type="code" themeColor="mutedForeground">
                        {new Date(message.$createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                    </ThemedText>
                ) : null}
                {message.replyToId ? (
                    <StatusPill label="reply" tone="neutral" />
                ) : null}
            </View>
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
    backdrop: {
        ...StyleSheet.absoluteFill,
    },
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
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        gap: Spacing.three,
        paddingTop: Spacing.four,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    statusPill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    list: {
        gap: Spacing.two,
    },
    selectedPanel: {
        gap: Spacing.two,
    },
    actionButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderWidth: 1,
    },
    actionButtonPressed: {
        opacity: 0.85,
    },
    actionButtonLabel: {
        textAlign: "center",
    },
    timelineBlock: {
        gap: Spacing.three,
    },
    composerCard: {
        gap: Spacing.two,
        padding: Spacing.three,
        borderRadius: 18,
        borderWidth: 1,
    },
    composerActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    timelineList: {
        gap: Spacing.two,
    },
    messageList: {
        maxHeight: 420,
        minHeight: 240,
    },
    emptyTimeline: {
        padding: Spacing.three,
        borderRadius: 18,
    },
    messageCard: {
        gap: Spacing.two,
        padding: Spacing.three,
        borderRadius: 18,
        borderWidth: 1,
    },
    messageCardMine: {
        opacity: 0.98,
    },
    messageHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    messageBody: {
        fontSize: 14,
        lineHeight: 20,
    },
    messageFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
});
