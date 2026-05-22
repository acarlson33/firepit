import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import {
    fetchChannelMessages,
    fetchChannels,
    fetchMyServers,
    type Channel,
    type Message,
    type Server,
} from "@/lib/firepit";

type LoadState = "idle" | "loading" | "ready" | "error";

function hasId<T extends { $id?: string }>(
    item: T,
): item is T & { $id: string } {
    return typeof item.$id === "string" && item.$id.length > 0;
}

function formatMessageTime(createdAt?: string) {
    if (!createdAt) {
        return "now";
    }

    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) {
        return "now";
    }

    return parsedDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ChatTabScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { instanceUrl, accessToken, currentUser, state } =
        useFirepitBootstrap();

    const [servers, setServers] = useState<Server[]>([]);
    const [serverLoadState, setServerLoadState] = useState<LoadState>("idle");
    const [serverLoadError, setServerLoadError] = useState<string | null>(null);
    const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
    const [selectedServerId, setSelectedServerId] = useState<string | null>(
        null,
    );
    const [channels, setChannels] = useState<Channel[]>([]);
    const [channelLoadState, setChannelLoadState] = useState<LoadState>("idle");
    const [channelLoadError, setChannelLoadError] = useState<string | null>(
        null,
    );
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
        null,
    );
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageLoadState, setMessageLoadState] = useState<LoadState>("idle");
    const [messageLoadError, setMessageLoadError] = useState<string | null>(
        null,
    );
    const [messageDraft, setMessageDraft] = useState("");

    const selectedServer = useMemo(
        () => servers.find((server) => server.$id === selectedServerId) ?? null,
        [selectedServerId, servers],
    );
    const selectedChannel = useMemo(
        () =>
            channels.find((channel) => channel.$id === selectedChannelId) ??
            null,
        [channels, selectedChannelId],
    );
    const onlineCount = selectedServer?.memberCount ?? channels.length;
    const canLoadWorkspace = Boolean(
        state === "ready" && instanceUrl && accessToken,
    );

    useEffect(() => {
        const nextInstanceUrl = instanceUrl ?? "";
        const nextAccessToken = accessToken ?? "";

        if (!canLoadWorkspace || !nextInstanceUrl || !nextAccessToken) {
            return;
        }

        let cancelled = false;

        async function loadServers() {
            setServerLoadState("loading");
            setServerLoadError(null);

            try {
                const nextServers = await fetchMyServers(
                    nextInstanceUrl,
                    nextAccessToken,
                );
                if (cancelled) {
                    return;
                }

                const selectableServers = (nextServers.servers ?? []).filter(
                    hasId,
                );
                setServers(selectableServers);
                setServerLoadState("ready");

                setSelectedServerId((currentServerId) => {
                    if (
                        currentServerId &&
                        selectableServers.some(
                            (server) => server.$id === currentServerId,
                        )
                    ) {
                        return currentServerId;
                    }

                    return selectableServers.at(0)?.$id ?? null;
                });
            } catch (error) {
                if (!cancelled) {
                    setServers([]);
                    setServerLoadState("error");
                    setServerLoadError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load servers",
                    );
                }
            }
        }

        void loadServers();

        return () => {
            cancelled = true;
        };
    }, [accessToken, canLoadWorkspace, instanceUrl]);

    useEffect(() => {
        const nextInstanceUrl = instanceUrl ?? "";
        const nextAccessToken = accessToken ?? "";

        const nextSelectedServerId = selectedServerId ?? "";

        if (!nextInstanceUrl || !nextAccessToken || !nextSelectedServerId) {
            setChannels([]);
            setChannelLoadState("idle");
            setChannelLoadError(null);
            setSelectedChannelId(null);
            return;
        }

        let cancelled = false;

        async function loadChannels() {
            setChannelLoadState("loading");
            setChannelLoadError(null);

            try {
                const nextChannels = await fetchChannels(
                    nextInstanceUrl,
                    nextAccessToken,
                    nextSelectedServerId,
                );
                if (cancelled) {
                    return;
                }

                const selectableChannels = (nextChannels.channels ?? []).filter(
                    hasId,
                );
                setChannels(selectableChannels);
                setChannelLoadState("ready");

                setSelectedChannelId((currentChannelId) => {
                    if (
                        currentChannelId &&
                        selectableChannels.some(
                            (channel) => channel.$id === currentChannelId,
                        )
                    ) {
                        return currentChannelId;
                    }

                    return selectableChannels.at(0)?.$id ?? null;
                });
            } catch (error) {
                if (!cancelled) {
                    setChannels([]);
                    setChannelLoadState("error");
                    setChannelLoadError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load channels",
                    );
                }
            }
        }

        void loadChannels();

        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceUrl, selectedServerId]);

    useEffect(() => {
        const nextInstanceUrl = instanceUrl ?? "";
        const nextAccessToken = accessToken ?? "";

        const nextSelectedChannelId = selectedChannelId ?? "";

        if (!nextInstanceUrl || !nextAccessToken || !nextSelectedChannelId) {
            setMessages([]);
            setMessageLoadState("idle");
            setMessageLoadError(null);
            return;
        }

        let cancelled = false;

        async function loadMessages() {
            setMessageLoadState("loading");
            setMessageLoadError(null);

            try {
                const nextMessages = await fetchChannelMessages(
                    nextInstanceUrl,
                    nextAccessToken,
                    nextSelectedChannelId,
                );
                if (cancelled) {
                    return;
                }

                setMessages(nextMessages.messages ?? []);
                setMessageLoadState("ready");
            } catch (error) {
                if (!cancelled) {
                    setMessages([]);
                    setMessageLoadState("error");
                    setMessageLoadError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load messages",
                    );
                }
            }
        }

        void loadMessages();

        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceUrl, selectedChannelId]);

    return (
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

            <SafeAreaView
                edges={["left", "right", "bottom"]}
                style={styles.safeArea}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[
                        styles.scrollContent,
                        {
                            paddingTop: insets.top + Spacing.three,
                            paddingHorizontal: Spacing.three,
                            paddingBottom:
                                insets.bottom + BottomTabInset + Spacing.three,
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <ThemedView type="card" style={styles.heroCard}>
                        <View style={styles.heroCopy}>
                            <ThemedText type="code" themeColor="accent">
                                Firepit chat
                            </ThemedText>
                            <ThemedText style={styles.heroTitle}>
                                Pick a server, then choose a channel.
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.description}
                            >
                                The screen now pulls real servers, channels, and
                                messages from the active instance.
                            </ThemedText>
                        </View>

                        <View style={styles.statusRow}>
                            <ThemedView type="muted" style={styles.statusPill}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    {selectedServer?.name ?? "No server"}
                                </ThemedText>
                            </ThemedView>
                            <ThemedView type="muted" style={styles.statusPill}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    {selectedChannel?.name ?? "No channel"}
                                </ThemedText>
                            </ThemedView>
                        </View>
                    </ThemedView>

                    <ThemedView type="card" style={styles.sectionCard}>
                        <View style={styles.sectionHeader}>
                            <ThemedText type="smallBold">Server</ThemedText>
                            <ThemedText
                                type="code"
                                themeColor="mutedForeground"
                            >
                                {serverLoadState === "loading"
                                    ? "Loading"
                                    : `${servers.length} available`}
                            </ThemedText>
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                                setIsServerMenuOpen((value) => !value)
                            }
                            style={({ pressed }) => [
                                styles.dropdownButton,
                                {
                                    backgroundColor: theme.card,
                                    borderColor: theme.input,
                                    opacity: pressed ? 0.92 : 1,
                                },
                            ]}
                        >
                            <View style={styles.dropdownButtonCopy}>
                                <ThemedText type="smallBold">
                                    {selectedServer?.name ?? "Choose a server"}
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.dropdownButtonMeta}
                                >
                                    {selectedServer?.memberCount != null
                                        ? `${selectedServer.memberCount} members`
                                        : "Tap to switch workspace"}
                                </ThemedText>
                            </View>
                            <ThemedText
                                type="code"
                                themeColor="mutedForeground"
                            >
                                {isServerMenuOpen ? "▴" : "▾"}
                            </ThemedText>
                        </Pressable>

                        {isServerMenuOpen ? (
                            <View style={styles.dropdownMenu}>
                                {servers.length > 0 ? (
                                    servers.map((server) => {
                                        const isSelected =
                                            server.$id === selectedServerId;

                                        return (
                                            <Pressable
                                                key={server.$id}
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    const nextServerId =
                                                        server.$id;
                                                    if (nextServerId) {
                                                        setSelectedServerId(
                                                            nextServerId,
                                                        );
                                                        setIsServerMenuOpen(
                                                            false,
                                                        );
                                                    }
                                                }}
                                                style={({ pressed }) => [
                                                    styles.dropdownOption,
                                                    {
                                                        backgroundColor:
                                                            isSelected
                                                                ? theme.backgroundSelected
                                                                : theme.card,
                                                        opacity: pressed
                                                            ? 0.92
                                                            : 1,
                                                    },
                                                ]}
                                            >
                                                <View>
                                                    <ThemedText type="smallBold">
                                                        {server.name ??
                                                            "Untitled server"}
                                                    </ThemedText>
                                                    <ThemedText
                                                        themeColor="mutedForeground"
                                                        style={
                                                            styles.optionMeta
                                                        }
                                                    >
                                                        {server.description ??
                                                            "Open workspace"}
                                                    </ThemedText>
                                                </View>
                                                {isSelected ? (
                                                    <ThemedText
                                                        type="code"
                                                        themeColor="accent"
                                                    >
                                                        Selected
                                                    </ThemedText>
                                                ) : null}
                                            </Pressable>
                                        );
                                    })
                                ) : (
                                    <ThemedText themeColor="mutedForeground">
                                        No joined servers yet.
                                    </ThemedText>
                                )}
                            </View>
                        ) : null}

                        {serverLoadError ? (
                            <ThemedText themeColor="danger">
                                {serverLoadError}
                            </ThemedText>
                        ) : null}
                    </ThemedView>

                    <ThemedView type="card" style={styles.sectionCard}>
                        <View style={styles.sectionHeader}>
                            <ThemedText type="smallBold">Channels</ThemedText>
                            <ThemedText
                                type="code"
                                themeColor="mutedForeground"
                            >
                                {channelLoadState === "loading"
                                    ? "Loading"
                                    : `${channels.length} listed`}
                            </ThemedText>
                        </View>

                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.sectionCopy}
                        >
                            Pick a channel to load its message history.
                        </ThemedText>

                        {channelLoadError ? (
                            <ThemedText themeColor="danger">
                                {channelLoadError}
                            </ThemedText>
                        ) : null}

                        {channelLoadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading channels…
                                </ThemedText>
                            </View>
                        ) : null}

                        <View style={styles.channelList}>
                            {channels.length > 0 ? (
                                channels.map((channel) => {
                                    const isSelected =
                                        channel.$id === selectedChannelId;

                                    return (
                                        <Pressable
                                            key={channel.$id}
                                            accessibilityRole="button"
                                            onPress={() => {
                                                const nextChannelId =
                                                    channel.$id;
                                                if (nextChannelId) {
                                                    setSelectedChannelId(
                                                        nextChannelId,
                                                    );
                                                }
                                            }}
                                            style={({ pressed }) => [
                                                styles.channelRow,
                                                {
                                                    backgroundColor: isSelected
                                                        ? theme.backgroundSelected
                                                        : theme.card,
                                                    opacity: pressed ? 0.92 : 1,
                                                },
                                            ]}
                                        >
                                            <View style={styles.channelRowCopy}>
                                                <ThemedText type="smallBold">
                                                    #{channel.name ?? "channel"}
                                                </ThemedText>
                                                <ThemedText
                                                    themeColor="mutedForeground"
                                                    style={styles.optionMeta}
                                                >
                                                    {channel.topic ??
                                                        "No topic yet"}
                                                </ThemedText>
                                            </View>

                                            <View style={styles.channelRowMeta}>
                                                {channel.memberCount != null ? (
                                                    <ThemedText
                                                        type="code"
                                                        themeColor="mutedForeground"
                                                    >
                                                        {channel.memberCount}
                                                    </ThemedText>
                                                ) : null}
                                                {isSelected ? (
                                                    <ThemedText
                                                        type="code"
                                                        themeColor="accent"
                                                    >
                                                        Active
                                                    </ThemedText>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                })
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Pick a server to see its channels.
                                </ThemedText>
                            )}
                        </View>
                    </ThemedView>

                    <ThemedView
                        type="card"
                        style={[styles.sectionCard, styles.messageFeedCard]}
                    >
                        <View style={styles.sectionHeader}>
                            <View>
                                <ThemedText type="smallBold">
                                    Message stream
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.sectionCopy}
                                >
                                    {selectedChannel?.name
                                        ? `#${selectedChannel.name}`
                                        : "Select a channel to view messages."}
                                </ThemedText>
                            </View>

                            <ThemedView type="muted" style={styles.statusPill}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    {onlineCount} online
                                </ThemedText>
                            </ThemedView>
                        </View>

                        {messageLoadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading messages…
                                </ThemedText>
                            </View>
                        ) : null}

                        {messageLoadError ? (
                            <ThemedText themeColor="danger">
                                {messageLoadError}
                            </ThemedText>
                        ) : null}

                        <View style={styles.messageList}>
                            {messages.length > 0 ? (
                                messages.map((message) => (
                                    <MessageRow
                                        key={
                                            message.$id ??
                                            `${message.userName ?? message.userId ?? "system"}-${message.$createdAt ?? message.text ?? "message"}`
                                        }
                                        message={message}
                                    />
                                ))
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    {selectedChannel
                                        ? "No messages loaded for this channel yet."
                                        : "Choose a channel to load messages."}
                                </ThemedText>
                            )}
                        </View>
                    </ThemedView>

                    <ThemedView type="card" style={styles.composerShell}>
                        <View style={styles.composerRow}>
                            <View style={styles.composerAvatar}>
                                <ThemedText type="smallBold">+</ThemedText>
                            </View>
                            <TextInput
                                value={messageDraft}
                                onChangeText={setMessageDraft}
                                placeholder="Message #channel"
                                placeholderTextColor={theme.mutedForeground}
                                style={[
                                    styles.composerInput,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            <Pressable
                                accessibilityRole="button"
                                disabled
                                style={({ pressed }) => [
                                    styles.sendButton,
                                    {
                                        backgroundColor: theme.primary,
                                        opacity: pressed ? 0.9 : 1,
                                    },
                                ]}
                            >
                                <ThemedText
                                    type="smallBold"
                                    themeColor="primaryForeground"
                                >
                                    Send
                                </ThemedText>
                            </Pressable>
                        </View>
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.composerNote}
                        >
                            Sending is still disabled. The selector flow is now
                            wired to the live instance.
                        </ThemedText>
                    </ThemedView>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function MessageRow({ message }: { message: Message }) {
    const theme = useTheme();
    const authorName = message.userName ?? message.userId ?? "System";
    const avatarLetter = authorName.slice(0, 1).toUpperCase();

    return (
        <View style={styles.messageRow}>
            <View
                style={[
                    styles.messageAvatar,
                    {
                        backgroundColor: message.userId
                            ? theme.primary
                            : theme.secondary,
                    },
                ]}
            >
                <ThemedText type="smallBold" themeColor="foreground">
                    {avatarLetter}
                </ThemedText>
            </View>

            <View style={styles.messageBody}>
                <View style={styles.messageMeta}>
                    <ThemedText type="smallBold">{authorName}</ThemedText>
                    <ThemedText themeColor="mutedForeground" type="code">
                        {formatMessageTime(message.$createdAt)}
                    </ThemedText>
                </View>
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.messageText}
                >
                    {message.text ?? "No text content"}
                </ThemedText>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        width: "100%",
        height: "100%",
    },
    safeArea: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
        width: "100%",
    },
    scrollContent: {
        flexGrow: 1,
        width: "100%",
        gap: Spacing.three,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    heroCopy: {
        gap: Spacing.one,
        minWidth: 0,
    },
    heroTitle: {
        fontSize: 24,
        lineHeight: 30,
        letterSpacing: -0.3,
        fontWeight: "700",
        flexShrink: 1,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        flexShrink: 1,
    },
    statusRow: {
        flexDirection: "row",
        gap: Spacing.two,
        flexWrap: "wrap",
    },
    statusPill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    sectionCard: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    messageFeedCard: {
        flexGrow: 1,
        minHeight: 300,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    sectionCopy: {
        fontSize: 14,
        lineHeight: 20,
    },
    dropdownButton: {
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    dropdownButtonCopy: {
        flex: 1,
        gap: 2,
    },
    dropdownButtonMeta: {
        fontSize: 13,
        lineHeight: 18,
    },
    dropdownMenu: {
        gap: Spacing.two,
    },
    dropdownOption: {
        borderRadius: 18,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    optionMeta: {
        fontSize: 13,
        lineHeight: 18,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
    },
    channelList: {
        gap: Spacing.two,
    },
    channelRow: {
        borderRadius: 18,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    channelRowCopy: {
        flex: 1,
        gap: 2,
    },
    channelRowMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    messageList: {
        gap: Spacing.three,
        flexGrow: 1,
    },
    messageRow: {
        flexDirection: "row",
        gap: Spacing.three,
        alignItems: "flex-start",
    },
    messageAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    messageBody: {
        flex: 1,
        gap: Spacing.one,
    },
    messageMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
        flexWrap: "wrap",
    },
    messageText: {
        fontSize: 15,
        lineHeight: 22,
    },
    composerShell: {
        borderRadius: 28,
        padding: Spacing.three,
        gap: Spacing.two,
        overflow: "hidden",
    },
    composerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    composerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(217, 121, 43, 0.20)",
    },
    composerInput: {
        flex: 1,
        minHeight: 48,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 15,
    },
    sendButton: {
        minHeight: 48,
        paddingHorizontal: Spacing.three,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    composerNote: {
        fontSize: 13,
        lineHeight: 18,
    },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -90,
        left: -80,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -120,
        bottom: 40,
    },
});
