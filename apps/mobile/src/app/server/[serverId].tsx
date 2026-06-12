import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Channel } from "@/lib/firepit";
import { fetchChannels, fetchServer } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function ServerBrowserScreen() {
    const theme = useTheme();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();
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

    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;
    const signedIn = Boolean(state === "ready" && accessToken && currentUser);
    const canManageServer = signedIn && currentUser?.roles != null && Object.keys(currentUser.roles).length > 0;

    const shellStatus = useMemo(() => {
        if (state === "ready") {
            return "connected";
        }
        if (state === "needs-auth") {
            return "needs login";
        }
        if (state === "incompatible") {
            return "blocked";
        }
        return state;
    }, [state]);

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

    useEffect(() => {
        void loadServer();
    }, [loadServer]);

    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    const openChannel = useCallback(
        (nextChannelId?: string | null) => {
            if (!normalizedServerId || !nextChannelId) {
                return;
            }

            router.push({
                pathname: "/server/messages/[serverId]/[channelId]",
                params: {
                    serverId: normalizedServerId,
                    channelId: nextChannelId,
                },
            });
        },
        [normalizedServerId],
    );

    return (
        <AuthRouteGuard>
            <ScrollView
                style={[styles.scrollView, styles.scrollView]}
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
                                Pick a channel to open the message subpage.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        channelLoadState === "ready"
                                            ? `${channels.length} channels`
                                            : "loading channels"
                                    }
                                    tone={
                                        channelLoadState === "ready"
                                            ? "success"
                                            : channelLoadState === "error"
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
                            <ThemedText type="smallBold">Navigation</ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Open the server browser again if you want to
                                switch instances or pick another server.
                            </ThemedText>
                            <View style={styles.navButtonRow}>
                                <ThemedView
                                    type="secondary"
                                    style={styles.backLink}
                                >
                                    <ThemedText
                                        type="smallBold"
                                        onPress={() => router.push("/home")}
                                    >
                                        Back to server browser
                                    </ThemedText>
                                </ThemedView>
                                {canManageServer ? (
                                    <>
                                        <ActionButton
                                            label="Manage channels"
                                            tone="secondary"
                                            onPress={() => {
                                                if (normalizedServerId) {
                                                    router.push(
                                                        `/server/${normalizedServerId}/channels` as never,
                                                    );
                                                }
                                            }}
                                        />
                                        <ActionButton
                                            label="Manage roles"
                                            tone="ghost"
                                            onPress={() => {
                                                if (normalizedServerId) {
                                                    router.push(
                                                        `/server/${normalizedServerId}/roles` as never,
                                                    );
                                                }
                                            }}
                                        />
                                    </>
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
                                Open a channel to read and send messages.
                            </ThemedText>

                            {channelLoadState === "loading" ? (
                                <ThemedText themeColor="mutedForeground">
                                    Loading channels…
                                </ThemedText>
                            ) : null}
                            {channelLoadError ? (
                                <ThemedText themeColor="destructive">
                                    {channelLoadError}
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
                                            onPress={() =>
                                                openChannel(channel.$id)
                                            }
                                        />
                                    ))}
                                </View>
                            ) : channelLoadState === "ready" ? (
                                <ThemedText themeColor="mutedForeground">
                                    No channels were returned for this server.
                                </ThemedText>
                            ) : null}
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
                                Open a message subpage instead of scrolling
                                through all channel details here.
                            </ThemedText>
                            <ThemedView
                                type="secondary"
                                style={styles.backLink}
                            >
                                <ThemedText
                                    type="smallBold"
                                    onPress={() => router.push("/home")}
                                >
                                    Back to server browser
                                </ThemedText>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
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

function ChannelCard({
    channel,
    onPress,
}: {
    channel: Channel;
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
                pressed && styles.channelCardPressed,
                {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                },
            ]}
        >
            <View style={styles.channelCardHeader}>
                <View style={styles.channelTitleRow}>
                    <ThemedText type="smallBold">
                        {channel.name ?? "Unnamed channel"}
                    </ThemedText>
                    <ThemedText
                        themeColor="mutedForeground"
                        style={styles.channelMeta}
                    >
                        {channel.$id ?? "No channel ID"}
                    </ThemedText>
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
                {typeof channel.unreadCount === "number" && channel.unreadCount > 0 ? (
                    <StatusPill
                        label={`${channel.unreadCount} unread`}
                        tone="warning"
                    />
                ) : null}
                {channel.memberCount != null ? (
                    <StatusPill
                        label={`${channel.memberCount} members`}
                        tone="neutral"
                    />
                ) : null}
                <ThemedText type="code" themeColor="accent">
                    Open messages
                </ThemedText>
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
    channelMeta: {
        fontSize: 12,
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
    navButtonRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
        alignItems: "center",
    },
});
