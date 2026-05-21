import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ImageViewer } from "@/components/image-viewer";
import ChatInput from "@/components/chat-input";
import MessageWithMentions from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { Image } from "expo-image";
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

export default function ServerWorkspaceScreen() {
    const theme = useTheme();
    const { serverId, channelId } = useLocalSearchParams<{
        serverId?: string;
        channelId?: string;
    }>();
    const { instanceUrl, accessToken, currentUser, state } =
        useFirepitBootstrap();
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [serverName, setServerName] = useState<string | null>(null);
    const [serverLoadState, setServerLoadState] = useState<LoadState>("idle");
    const [serverLoadError, setServerLoadError] = useState<string | null>(null);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [messageDraft, setMessageDraft] = useState("");
    const [messageSendState, setMessageSendState] = useState<LoadState>("idle");
    const [messageError, setMessageError] = useState<string | null>(null);
    const [messageLoadState, setMessageLoadState] = useState<LoadState>("idle");
    const [messageLoadError, setMessageLoadError] = useState<string | null>(
        null,
    );
    const [messagesByChannel, setMessagesByChannel] = useState<
        Record<string, Message[]>
    >({});
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

    const timelineMessages = useMemo(() => {
        if (!normalizedChannelId) {
            return [];
        }

        return messagesByChannel[normalizedChannelId] ?? [];
    }, [messagesByChannel, normalizedChannelId]);

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

        setLoadState("loading");
        setLoadError(null);

        try {
            const nextChannels = await fetchChannels(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setChannels(nextChannels.channels ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load channels",
            );
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    useEffect(() => {
        void loadServer();
    }, [loadServer]);

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

                setMessagesByChannel((prev) => ({
                    ...prev,
                    [nextChannelId]: nextMessages.messages ?? [],
                }));
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
        if (!normalizedChannelId || !selectedChannel) {
            setMessageLoadState("idle");
            setMessageLoadError(null);
            return;
        }

        void loadMessages(normalizedChannelId);
    }, [loadMessages, normalizedChannelId, selectedChannel]);

    const openChannel = useCallback(
        (nextChannelId?: string | null) => {
            if (!normalizedServerId || !nextChannelId) {
                return;
            }

            router.push({
                pathname: "/server/[serverId]",
                params: {
                    serverId: normalizedServerId,
                    channelId: nextChannelId,
                },
            });
        },
        [normalizedServerId],
    );

    const clearChannel = useCallback(() => {
        if (!normalizedServerId) {
            return;
        }

        router.replace({
            pathname: "/server/[serverId]",
            params: { serverId: normalizedServerId },
        });
    }, [normalizedServerId]);

    const sendMessage = useCallback(async () => {
        if (
            !instanceUrl ||
            !accessToken ||
            !selectedChannel?.$id ||
            !normalizedServerId
        ) {
            return;
        }

        const text = messageDraft?.trim?.() ?? "";
        if (!text) {
            return;
        }

        setMessageSendState("loading");
        setMessageError(null);

        try {
            const response = await createChannelMessage(
                instanceUrl,
                accessToken,
                {
                    channelId: selectedChannel.$id,
                    serverId: normalizedServerId,
                    text,
                },
            );
            setMessageDraft("");
            setMessageSendState("ready");
            void loadMessages(selectedChannel.$id);
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
        currentUser,
        loadMessages,
        instanceUrl,
        messageDraft,
        normalizedServerId,
        selectedChannel?.$id,
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
                        { backgroundColor: "rgba(78, 138, 134, 0.1)" },
                    ]}
                />
                <SafeAreaView style={styles.safeArea}>
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[
                                styles.heroCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Server workspace
                            </ThemedText>
                            <ThemedText type="subtitle">
                                {serverName ??
                                    normalizedServerId ??
                                    "Unknown server"}
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                {serverLoadState === "loading"
                                    ? "Loading server details and channels…"
                                    : serverLoadError
                                      ? serverLoadError
                                      : "This slice brings in the server channel list and keeps the next message view one tap away."}
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        signedIn
                                            ? "signed in"
                                            : "sign in required"
                                    }
                                    tone={signedIn ? "success" : "warning"}
                                />
                                <StatusPill
                                    label={
                                        serverLoadState === "ready"
                                            ? (serverName ?? "unnamed server")
                                            : serverLoadState === "error"
                                              ? "server load error"
                                              : "loading server"
                                    }
                                    tone={
                                        serverLoadState === "ready"
                                            ? "success"
                                            : serverLoadState === "error"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${channels.length} channels`
                                            : "loading channels"
                                    }
                                    tone={
                                        loadState === "ready"
                                            ? "success"
                                            : loadState === "error"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                                {selectedChannel ? (
                                    <StatusPill
                                        label="channel selected"
                                        tone="success"
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
                                    Channels
                                </ThemedText>
                                <ActionButton
                                    label="Refresh"
                                    tone="ghost"
                                    onPress={loadChannels}
                                />
                            </View>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Pick a channel to continue into the message
                                timeline.
                            </ThemedText>

                            {loadState === "loading" ? (
                                <ThemedText themeColor="mutedForeground">
                                    Loading channels…
                                </ThemedText>
                            ) : null}
                            {loadError ? (
                                <ThemedText themeColor="destructive">
                                    {loadError}
                                </ThemedText>
                            ) : null}

                            {!signedIn ? (
                                <ThemedText themeColor="mutedForeground">
                                    Sign in to load channels for this server.
                                </ThemedText>
                            ) : channels.length > 0 ? (
                                <View style={styles.list}>
                                    {channels.map((channel) => (
                                        <ChannelCard
                                            key={channel.$id ?? channel.name}
                                            channel={channel}
                                            selected={
                                                channel.$id ===
                                                normalizedChannelId
                                            }
                                            onPress={() =>
                                                openChannel(channel.$id)
                                            }
                                        />
                                    ))}
                                </View>
                            ) : loadState === "ready" ? (
                                <ThemedText themeColor="mutedForeground">
                                    No channels were returned for this server.
                                </ThemedText>
                            ) : null}
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">
                                    Selected channel
                                </ThemedText>
                                {selectedChannel ? (
                                    <ActionButton
                                        label="Clear"
                                        tone="ghost"
                                        onPress={clearChannel}
                                    />
                                ) : null}
                            </View>

                            {selectedChannel ? (
                                <View style={styles.selectedPanel}>
                                    <ThemedText type="subtitle">
                                        {selectedChannel.name ??
                                            "Unnamed channel"}
                                    </ThemedText>
                                    <View style={styles.pillRow}>
                                        <StatusPill
                                            label={
                                                selectedChannel.type ?? "text"
                                            }
                                            tone={
                                                selectedChannel.type ===
                                                "announcement"
                                                    ? "warning"
                                                    : selectedChannel.type ===
                                                        "voice"
                                                      ? "success"
                                                      : "neutral"
                                            }
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
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        The next slice will replace this shell
                                        with the message timeline and thread
                                        navigation.
                                    </ThemedText>
                                </View>
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Select a channel above to open the next
                                    workspace view.
                                </ThemedText>
                            )}
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">
                                    Message timeline
                                </ThemedText>
                                {selectedChannel ? (
                                    <StatusPill
                                        label={
                                            selectedChannel.name ?? "channel"
                                        }
                                        tone={selectedChannelTone}
                                    />
                                ) : null}
                            </View>

                            {selectedChannel ? (
                                <View style={styles.timelineBlock}>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        {messageLoadState === "loading"
                                            ? "Loading messages…"
                                            : messageLoadError
                                              ? messageLoadError
                                              : "Historical messages are loaded from the server so the chat reads like a real conversation."}
                                    </ThemedText>

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

                                    {messageError ? (
                                        <ThemedText themeColor="destructive">
                                            {messageError}
                                        </ThemedText>
                                    ) : null}

                                    {timelineMessages.length > 0 ? (
                                        <View style={styles.timelineList}>
                                            {timelineMessages.map((message) => (
                                                <MessageCard
                                                    key={
                                                        message.$id ??
                                                        `${message.channelId}-${message.$createdAt}`
                                                    }
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
                                                            if (!msgId) return;
                                                            await toggleReaction(
                                                                String(msgId),
                                                                emoji,
                                                                isAdding,
                                                                false,
                                                            );
                                                        } catch (err) {
                                                            console.warn(
                                                                "Failed to toggle reaction",
                                                                err,
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
                                            ))}
                                        </View>
                                    ) : messageLoadState ===
                                      "loading" ? null : (
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
                                                Send the first message to start
                                                the conversation.
                                            </ThemedText>
                                        </ThemedView>
                                    )}
                                </View>
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Select a channel to open its message
                                    timeline.
                                </ThemedText>
                            )}
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Navigation</ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Use the browser to jump between servers while
                                the timeline slice is added.
                            </ThemedText>
                            <ThemedView
                                type="secondary"
                                style={styles.backLink}
                            >
                                <ThemedText
                                    type="smallBold"
                                    onPress={() => router.push("/explore")}
                                >
                                    Back to server browser
                                </ThemedText>
                            </ThemedView>
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
                    {reactions.map((r) => (
                        <ReactionButton
                            key={`${message.$id}-${r.emoji}`}
                            reaction={r}
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

function ChannelCard({
    channel,
    selected,
    onPress,
}: {
    channel: Channel;
    selected: boolean;
    onPress: () => void;
}) {
    const theme = useTheme();

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${channel.name ?? "channel"}`}
            onPress={onPress}
            style={({ pressed }) => [
                styles.channelCard,
                selected && styles.channelCardSelected,
                pressed && styles.channelCardPressed,
                {
                    backgroundColor: selected ? theme.secondary : theme.card,
                    borderColor: selected ? theme.primary : theme.border,
                },
            ]}
        >
            <View style={styles.channelCardHeader}>
                <View style={styles.channelTitleRow}>
                    <ThemedText type="smallBold">
                        {channel.name ?? "Unnamed channel"}
                    </ThemedText>
                    {selected ? (
                        <StatusPill label="selected" tone="success" />
                    ) : null}
                </View>
                <StatusPill
                    label={channel.type ?? "text"}
                    tone={
                        channel.type === "announcement"
                            ? "warning"
                            : channel.type === "voice"
                              ? "success"
                              : "neutral"
                    }
                />
            </View>

            {channel.topic ? (
                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                    {channel.topic}
                </ThemedText>
            ) : (
                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                    No topic set.
                </ThemedText>
            )}

            <View style={styles.channelMetaRow}>
                {channel.$id ? (
                    <ThemedText type="code" themeColor="mutedForeground">
                        {channel.$id}
                    </ThemedText>
                ) : null}
                {channel.memberCount != null ? (
                    <StatusPill
                        label={`${channel.memberCount} members`}
                        tone="neutral"
                    />
                ) : null}
            </View>
        </Pressable>
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
    channelCard: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    channelCardSelected: {
        transform: [{ scale: 0.99 }],
    },
    channelCardPressed: {
        transform: [{ scale: 0.99 }],
    },
    channelCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    channelTitleRow: {
        flex: 1,
        gap: Spacing.one,
    },
    channelMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
        alignItems: "center",
    },
    backLink: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
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
    composerInput: {
        minHeight: 96,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        textAlignVertical: "top",
    },
    composerActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    timelineList: {
        gap: Spacing.two,
    },
    emptyTimeline: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.one,
        borderWidth: 1,
    },
    messageCard: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    messageCardMine: {
        borderWidth: 1,
    },
    messageHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
        alignItems: "flex-start",
    },
    messageBody: {
        fontSize: 15,
        lineHeight: 22,
    },
    messageFooter: {
        flexDirection: "row",
        gap: Spacing.one,
        flexWrap: "wrap",
        alignItems: "center",
    },
});
