import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Channel, ServerCategory } from "@/lib/firepit";
import { muteChannel, muteServer } from "@/lib/firepit/messages";
import { getChannels, getCategories, getServerName as getCachedServerName, invalidateServerCache } from "@/lib/server-cache";
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
    const [categories, setCategories] = useState<ServerCategory[]>([]);
    const [channelLoadState, setChannelLoadState] = useState<LoadState>("idle");
    const [channelLoadError, setChannelLoadError] = useState<string | null>(
        null,
    );

    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;
    const signedIn = Boolean(state === "ready" && accessToken && currentUser);
    const canManageServer = signedIn && currentUser?.roles != null && Object.keys(currentUser.roles).length > 0;
    const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
    const [serverMuted, setServerMuted] = useState(false);

    const loadServer = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }

        setServerLoadState("loading");
        setServerLoadError(null);

        try {
            const name = await getCachedServerName(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setServerName(name);
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
            const [nextChannels, nextCategories] = await Promise.all([
                getChannels(instanceUrl, accessToken, normalizedServerId),
                getCategories(instanceUrl, accessToken, normalizedServerId),
            ]);
            setChannels(nextChannels);
            setCategories(nextCategories);
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

    const handleChannelMute = useCallback(async (channelId: string, currentlyMuted: boolean, duration: "15m" | "1h" | "8h" | "24h" | "forever" = "forever") => {
        if (!instanceUrl || !accessToken) return;
        try {
            await muteChannel(instanceUrl, accessToken, channelId, !currentlyMuted, duration);
            setMutedChannels((prev) => {
                const next = new Set(prev);
                if (currentlyMuted) {
                    next.delete(channelId);
                } else {
                    next.add(channelId);
                }
                return next;
            });
        } catch {
            console.error("[server:muteChannel] Failed to toggle channel mute");
        }
    }, [instanceUrl, accessToken]);

    const handleServerMute = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) return;
        try {
            await muteServer(instanceUrl, accessToken, normalizedServerId, !serverMuted);
            setServerMuted((prev) => !prev);
        } catch {
            console.error("[server:muteServer] Failed to toggle server mute");
        }
    }, [instanceUrl, accessToken, normalizedServerId, serverMuted]);

    // Group channels by category
    const groupedChannels = useMemo(() => {
        const sorted = [...categories].sort((a, b) => {
            const ap = a.position ?? 0;
            const bp = b.position ?? 0;
            if (ap !== bp) return ap - bp;
            return (a.name ?? "").localeCompare(b.name ?? "");
        });
        const catMap = new Map<string, Channel[]>();
        for (const ch of channels) {
            const cid = ch.categoryId ?? "";
            if (!cid) continue;
            if (!catMap.has(cid)) catMap.set(cid, []);
            catMap.get(cid)!.push(ch);
        }
        return sorted.map((cat) => ({
            category: cat,
            channels: (catMap.get(cat.$id ?? "") ?? []).sort((a, b) =>
                (a.name ?? "").localeCompare(b.name ?? ""),
            ),
        }));
    }, [categories, channels]);

    const uncategorizedChannels = useMemo(() => {
        return [...channels]
            .filter((ch) => !ch.categoryId)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }, [channels]);

    return (
        <AuthRouteGuard>
            <View
                style={[styles.root, { backgroundColor: theme.background }]}
            >
                <View
                    pointerEvents="none"
                    style={[
                        styles.backdropOrbTop,
                        { backgroundColor: "rgba(217, 121, 43, 0.08)" },
                    ]}
                />
                <View
                    pointerEvents="none"
                    style={[
                        styles.backdropOrbBottom,
                        { backgroundColor: "rgba(78, 138, 134, 0.06)" },
                    ]}
                />
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                    >
                        <ThemedView style={styles.shell}>
                        {/* Simple header replacing hero card */}
                        <View style={styles.header}>
                            <ThemedText type="code" themeColor="accent">
                                Server workspace
                            </ThemedText>
                            <ThemedText type="subtitle">
                                {serverName ??
                                    normalizedServerId ??
                                    "Unknown server"}
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
                        </View>

                        {/* Navigation chips */}
                        <View style={styles.navButtonRow}>
                            <ActionButton
                                label="Back to browser"
                                tone="secondary"
                                onPress={() => router.push("/home")}
                            />
                            {canManageServer ? (
                                <>
                                    <ActionButton
                                        label="Channels"
                                        tone="ghost"
                                        onPress={() => {
                                            if (normalizedServerId) {
                                                router.push(
                                                    `/server/${normalizedServerId}/channels` as never,
                                                );
                                            }
                                        }}
                                    />
                                    <ActionButton
                                        label="Roles"
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
                            <ActionButton
                                label={serverMuted ? "Unmute server" : "Mute server"}
                                tone="ghost"
                                onPress={handleServerMute}
                            />
                        </View>

                        {/* Channels section */}
                        <View style={styles.sectionHeaderRow}>
                            <ThemedText type="smallBold">
                                Channels
                            </ThemedText>
                            <ActionButton
                                label="Refresh"
                                tone="ghost"
                                onPress={() => {
                                    if (instanceUrl && normalizedServerId) invalidateServerCache(instanceUrl, normalizedServerId);
                                    void loadChannels();
                                }}
                            />
                        </View>

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
                                {groupedChannels.map(({ category, channels: catChannels }) => (
                                    <View key={category.$id} style={styles.categorySection}>
                                        <View style={styles.categoryHeader}>
                                            <ThemedText type="smallBold" style={styles.categoryHeaderText}>
                                                {category.name ?? "Category"}
                                            </ThemedText>
                                            <ThemedText type="code" themeColor="mutedForeground">
                                                {catChannels.length}
                                            </ThemedText>
                                        </View>
                                        {catChannels.map((channel) => (
                                            <ChannelCard
                                                key={channel.$id ?? channel.name}
                                                channel={channel}
                                                isMuted={mutedChannels.has(channel.$id ?? "")}
                                                onPress={() =>
                                                    openChannel(channel.$id)
                                                }
                                                onMuteToggle={(duration) => {
                                                    if (channel.$id) {
                                                        handleChannelMute(channel.$id, mutedChannels.has(channel.$id), duration);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </View>
                                ))}
                                {uncategorizedChannels.length > 0 && (
                                    <View style={styles.categorySection}>
                                        {groupedChannels.length > 0 && (
                                            <View style={styles.categoryHeader}>
                                                <ThemedText type="smallBold" style={styles.categoryHeaderText}>
                                                    Uncategorized
                                                </ThemedText>
                                                <ThemedText type="code" themeColor="mutedForeground">
                                                    {uncategorizedChannels.length}
                                                </ThemedText>
                                            </View>
                                        )}
                                        {uncategorizedChannels.map((channel) => (
                                            <ChannelCard
                                                key={channel.$id ?? channel.name}
                                                channel={channel}
                                                isMuted={mutedChannels.has(channel.$id ?? "")}
                                                onPress={() =>
                                                    openChannel(channel.$id)
                                                }
                                                onMuteToggle={(duration) => {
                                                    if (channel.$id) {
                                                        handleChannelMute(channel.$id, mutedChannels.has(channel.$id), duration);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </View>
                                )}
                            </View>
                        ) : channelLoadState === "ready" ? (
                            <ThemedText themeColor="mutedForeground">
                                No channels were returned for this server.
                            </ThemedText>
                        ) : null}
                    </ThemedView>
                    </ScrollView>
                </SafeAreaView>
            </View>
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
    isMuted,
    onPress,
    onMuteToggle,
}: {
    channel: Channel;
    isMuted: boolean;
    onPress: () => void;
    onMuteToggle?: (duration?: "15m" | "1h" | "8h" | "24h" | "forever") => void;
}) {
    const theme = useTheme();
    const [showMuteAction, setShowMuteAction] = useState(false);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${channel.name ?? "channel"}`}
            onPress={onPress}
            onLongPress={() => setShowMuteAction(true)}
            delayLongPress={350}
            style={({ pressed }) => [
                styles.channelCard,
                pressed && styles.channelCardPressed,
                {
                    backgroundColor: theme.card,
                    borderColor: isMuted ? theme.destructive + "40" : theme.border,
                    opacity: isMuted ? 0.65 : 1,
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
                <View style={styles.channelTypeRow}>
                    {isMuted ? (
                        <ThemedText type="code" themeColor="destructive" style={styles.channelMutedLabel}>
                            Muted
                        </ThemedText>
                    ) : null}
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
                {typeof channel.unreadCount === "number" && channel.unreadCount > 0 && !isMuted ? (
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
                {showMuteAction ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            if (isMuted) {
                                onMuteToggle?.();
                            } else {
                                Alert.alert("Mute channel", "For how long?", [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "15 minutes", onPress: () => onMuteToggle?.("15m") },
                                    { text: "1 hour", onPress: () => onMuteToggle?.("1h") },
                                    { text: "8 hours", onPress: () => onMuteToggle?.("8h") },
                                    { text: "24 hours", onPress: () => onMuteToggle?.("24h") },
                                    { text: "Until I turn it off", onPress: () => onMuteToggle?.("forever") },
                                ]);
                            }
                            setShowMuteAction(false);
                        }}
                        style={({ pressed }) => [
                            styles.muteActionButton,
                            {
                                backgroundColor: isMuted ? theme.primary + "20" : theme.destructive + "20",
                                opacity: pressed ? 0.8 : 1,
                            },
                        ]}
                    >
                        <ThemedText type="smallBold" themeColor={isMuted ? "foreground" : "destructive"}>
                            {isMuted ? "Unmute" : "Mute"}
                        </ThemedText>
                    </Pressable>
                ) : (
                    <ThemedText type="code" themeColor="accent">
                        Open messages
                    </ThemedText>
                )}
                {showMuteAction ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowMuteAction(false)}
                        style={({ pressed }) => [
                            styles.muteActionButton,
                            {
                                backgroundColor: theme.muted,
                                opacity: pressed ? 0.8 : 1,
                            },
                        ]}
                    >
                        <ThemedText type="smallBold" themeColor="foreground">
                            Cancel
                        </ThemedText>
                    </Pressable>
                ) : null}
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
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
        paddingHorizontal: Spacing.two,
        paddingBottom: BottomTabInset + Spacing.two,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.two,
        paddingTop: Spacing.two,
    },
    header: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
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
        paddingHorizontal: Spacing.two,
    },
    statusPill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    list: {
        gap: Spacing.one,
    },
    categorySection: {
        gap: Spacing.half,
    },
    categoryHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.half,
    },
    categoryHeaderText: {
        fontSize: 11,
        letterSpacing: 0.5,
        textTransform: "uppercase",
    },
    actionButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderWidth: 1,
    },
    actionButtonPressed: {
        opacity: 0.85,
    },
    actionButtonLabel: {
        textAlign: "center",
    },
    channelCard: {
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.one,
        borderWidth: 1,
    },
    channelCardPressed: {
        transform: [{ scale: 0.99 }],
    },
    channelCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: Spacing.one,
    },
    channelTitleRow: {
        flex: 1,
        gap: Spacing.half,
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
    navButtonRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
        alignItems: "center",
        paddingHorizontal: Spacing.two,
    },
    channelTypeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
    },
    channelMutedLabel: {
        fontSize: 10,
        letterSpacing: 0.5,
    },
    muteActionButton: {
        borderRadius: 8,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.half,
    },
});
