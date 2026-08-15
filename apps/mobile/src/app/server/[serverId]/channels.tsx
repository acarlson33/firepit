import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Channel, ServerRole } from "@/lib/firepit";
import {
    createChannel,
    deleteChannel,
    fetchServerRoles,
    updateChannel,
} from "@/lib/firepit";
import { getChannels, invalidateServerCache } from "@/lib/server-cache";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { ArrowLeft } from "lucide-react-native";

type LoadState = "idle" | "loading" | "ready" | "error";

type ChannelDraft = {
    name: string;
    type: "text" | "voice" | "announcement";
    topic: string;
};

const EMPTY_DRAFT: ChannelDraft = { name: "", type: "text", topic: "" };

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

function ActionButton({
    label,
    onPress,
    disabled,
    tone = "primary",
    icon,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: "primary" | "secondary" | "ghost" | "danger";
    icon?: "back";
}) {
    const theme = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor:
                        tone === "danger"
                            ? theme.destructive
                            : tone === "primary"
                              ? theme.primary
                              : tone === "secondary"
                                ? theme.secondary
                                : theme.muted,
                    borderColor: tone === "danger" ? theme.destructive : theme.border,
                },
                pressed && !disabled && styles.actionButtonPressed,
                disabled && styles.actionButtonDisabled,
            ]}
        >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {icon === "back" && (
                    <ArrowLeft
                        size={16}
                        color={
                            tone === "primary" || tone === "danger"
                                ? theme.primaryForeground
                                : theme.foreground
                        }
                    />
                )}
                <ThemedText
                    type="smallBold"
                    themeColor={
                        tone === "primary" || tone === "danger"
                            ? "primaryForeground"
                            : "foreground"
                    }
                >
                    {label}
                </ThemedText>
            </View>
        </Pressable>
    );
}

export default function ChannelManagementScreen() {
    const theme = useTheme();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [channels, setChannels] = useState<Channel[]>([]);
    const [roles, setRoles] = useState<ServerRole[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Create modal
    const [createDraft, setCreateDraft] = useState<ChannelDraft>(EMPTY_DRAFT);
    const [showCreate, setShowCreate] = useState(false);

    // Edit modal
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
    const [editDraft, setEditDraft] = useState<ChannelDraft>(EMPTY_DRAFT);
    const [showEdit, setShowEdit] = useState(false);

    // Delete confirmation
    const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);

    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;

    const loadData = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }

        setLoadState("loading");
        setLoadError(null);

        try {
            const [nextChannels, rolesRes] = await Promise.all([
                getChannels(instanceUrl, accessToken, normalizedServerId),
                fetchServerRoles(instanceUrl, accessToken, normalizedServerId).catch(
                    () => ({ roles: [] as ServerRole[] }),
                ),
            ]);
            setChannels(nextChannels);
            setRoles(rolesRes.roles ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load channels",
            );
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useRetryOnReconnect(loadState === "error", loadData);

    const handleCreate = async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId || saving) return;
        const name = createDraft.name.trim();
        if (!name) return;

        setSaving(true);
        try {
            await createChannel(instanceUrl, accessToken, {
                serverId: normalizedServerId,
                name,
                type: createDraft.type,
                topic: createDraft.topic.trim() || undefined,
            });
            setShowCreate(false);
            setCreateDraft(EMPTY_DRAFT);
            invalidateServerCache(instanceUrl, normalizedServerId);
            await loadData();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to create channel",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        const channelId = editingChannel?.$id;
        if (!instanceUrl || !accessToken || !channelId || !normalizedServerId || saving) return;
        const name = editDraft.name.trim();
        if (!name) return;

        setSaving(true);
        try {
            await updateChannel(instanceUrl, accessToken, channelId, {
                name,
                type: editDraft.type,
                topic: editDraft.topic.trim() || null,
            });
            setShowEdit(false);
            setEditingChannel(null);
            invalidateServerCache(instanceUrl, normalizedServerId);
            await loadData();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to update channel",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!instanceUrl || !accessToken || !deletingChannel || saving) return;
        const channelId = deletingChannel.$id;
        if (!channelId || !normalizedServerId) return;

        setSaving(true);
        try {
            await deleteChannel(instanceUrl, accessToken, channelId);
            setDeletingChannel(null);
            invalidateServerCache(instanceUrl, normalizedServerId);
            await loadData();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to delete channel",
            );
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (channel: Channel) => {
        setEditingChannel(channel);
        setActionError(null);
        setEditDraft({
            name: channel.name ?? "",
            type: (channel.type as "text" | "voice" | "announcement") ?? "text",
            topic: channel.topic ?? "",
        });
        setShowEdit(true);
    };

    const textChannels = channels.filter((c) => c.type === "text" || !c.type);
    const voiceChannels = channels.filter((c) => c.type === "voice");
    const announcementChannels = channels.filter(
        (c) => c.type === "announcement",
    );

    return (
        <AuthRouteGuard>
            <ScrollView
                style={[styles.scrollView, { backgroundColor: theme.background }]}
                contentContainerStyle={styles.scrollContent}
            >
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
                        {/* Header */}
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Channel management
                            </ThemedText>
                            <ThemedText type="title">Manage server channels</ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Create, rename, and delete channels. Changes apply
                                immediately for all server members.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${channels.length} channels`
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
                                <StatusPill
                                    label={`${roles.length} roles`}
                                    tone="neutral"
                                />
                            </View>
                        </ThemedView>

                        {/* Actions */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">Actions</ThemedText>
                                <View style={styles.actionRow}>
                                    <ActionButton
                                        label="Back to server"
                                        tone="ghost"
                                        icon="back"
                                        onPress={() => {
                                            if (normalizedServerId) {
                                                router.replace(
                                                    `/server/${normalizedServerId}`,
                                                );
                                            }
                                        }}
                                    />
                                    <ActionButton
                                        label="Create channel"
                                        onPress={() => {
                                            setCreateDraft(EMPTY_DRAFT);
                                            setActionError(null);
                                            setShowCreate(true);
                                        }}
                                    />
                                </View>
                            </View>
                            {loadError ? (
                                <ThemedText themeColor="destructive">
                                    {loadError}
                                </ThemedText>
                            ) : null}
                        </ThemedView>

                        {/* Channel list */}
                        {loadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading channels…
                                </ThemedText>
                            </View>
                        ) : null}

                        {textChannels.length > 0 ? (
                            <ChannelSection
                                title="Text channels"
                                channels={textChannels}
                                onEdit={openEdit}
                                onDelete={(ch) => {
                                    setDeletingChannel(ch);
                                    setActionError(null);
                                }}
                            />
                        ) : null}

                        {voiceChannels.length > 0 ? (
                            <ChannelSection
                                title="Voice channels"
                                channels={voiceChannels}
                                onEdit={openEdit}
                                onDelete={(ch) => {
                                    setDeletingChannel(ch);
                                    setActionError(null);
                                }}
                            />
                        ) : null}

                        {announcementChannels.length > 0 ? (
                            <ChannelSection
                                title="Announcement channels"
                                channels={announcementChannels}
                                onEdit={openEdit}
                                onDelete={(ch) => {
                                    setDeletingChannel(ch);
                                    setActionError(null);
                                }}
                            />
                        ) : null}

                        {loadState === "ready" && channels.length === 0 ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText themeColor="mutedForeground">
                                    No channels found. Create the first one to get started.
                                </ThemedText>
                            </ThemedView>
                        ) : null}
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>

            {/* Create modal */}
            <Modal
                visible={showCreate}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCreate(false)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setShowCreate(false)}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <ThemedView
                            type="card"
                            style={[
                                styles.modalCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="smallBold">Create channel</ThemedText>
                            <TextInput
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder="e.g. general"
                                placeholderTextColor={theme.mutedForeground}
                                value={createDraft.name}
                                onChangeText={(text) =>
                                    setCreateDraft((d) => ({ ...d, name: text }))
                                }
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            <View style={styles.typeRow}>
                                {(["text", "voice", "announcement"] as const).map(
                                    (type) => (
                                        <Pressable
                                            key={type}
                                            onPress={() =>
                                                setCreateDraft((d) => ({ ...d, type }))
                                            }
                                            style={[
                                                styles.typePill,
                                                {
                                                    backgroundColor:
                                                        createDraft.type === type
                                                            ? theme.primary
                                                            : theme.card,
                                                    borderColor:
                                                        createDraft.type === type
                                                            ? theme.primary
                                                            : theme.border,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor={
                                                    createDraft.type === type
                                                        ? "primaryForeground"
                                                        : "foreground"
                                                }
                                            >
                                                {type}
                                            </ThemedText>
                                        </Pressable>
                                    ),
                                )}
                            </View>
                            <TextInput
                                placeholder="Topic (optional)"
                                placeholderTextColor={theme.mutedForeground}
                                value={createDraft.topic}
                                onChangeText={(text) =>
                                    setCreateDraft((d) => ({ ...d, topic: text }))
                                }
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            {actionError ? (
                                <ThemedText themeColor="destructive">
                                    {actionError}
                                </ThemedText>
                            ) : null}
                            <View style={styles.modalActions}>
                                <ActionButton
                                    label="Cancel"
                                    tone="ghost"
                                    onPress={() => setShowCreate(false)}
                                />
                                <ActionButton
                                    label={saving ? "Creating…" : "Create"}
                                    disabled={saving || !createDraft.name.trim()}
                                    onPress={() => void handleCreate()}
                                />
                            </View>
                        </ThemedView>
                    </View>
                </Pressable>
            </Modal>

            {/* Edit modal */}
            <Modal
                visible={showEdit}
                transparent
                animationType="fade"
                onRequestClose={() => setShowEdit(false)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setShowEdit(false)}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <ThemedView
                            type="card"
                            style={[
                                styles.modalCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="smallBold">Edit channel</ThemedText>
                            <TextInput
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder="Channel name"
                                placeholderTextColor={theme.mutedForeground}
                                value={editDraft.name}
                                onChangeText={(text) =>
                                    setEditDraft((d) => ({ ...d, name: text }))
                                }
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            <View style={styles.typeRow}>
                                {(["text", "voice", "announcement"] as const).map(
                                    (type) => (
                                        <Pressable
                                            key={type}
                                            onPress={() =>
                                                setEditDraft((d) => ({ ...d, type }))
                                            }
                                            style={[
                                                styles.typePill,
                                                {
                                                    backgroundColor:
                                                        editDraft.type === type
                                                            ? theme.primary
                                                            : theme.card,
                                                    borderColor:
                                                        editDraft.type === type
                                                            ? theme.primary
                                                            : theme.border,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor={
                                                    editDraft.type === type
                                                        ? "primaryForeground"
                                                        : "foreground"
                                                }
                                            >
                                                {type}
                                            </ThemedText>
                                        </Pressable>
                                    ),
                                )}
                            </View>
                            <TextInput
                                placeholder="Topic (optional)"
                                placeholderTextColor={theme.mutedForeground}
                                value={editDraft.topic}
                                onChangeText={(text) =>
                                    setEditDraft((d) => ({ ...d, topic: text }))
                                }
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            {actionError ? (
                                <ThemedText themeColor="destructive">
                                    {actionError}
                                </ThemedText>
                            ) : null}
                            <View style={styles.modalActions}>
                                <ActionButton
                                    label="Cancel"
                                    tone="ghost"
                                    onPress={() => setShowEdit(false)}
                                />
                                <ActionButton
                                    label={saving ? "Saving…" : "Save"}
                                    disabled={saving || !editDraft.name.trim()}
                                    onPress={() => void handleEdit()}
                                />
                            </View>
                        </ThemedView>
                    </View>
                </Pressable>
            </Modal>

            {/* Delete confirmation modal */}
            <Modal
                visible={Boolean(deletingChannel)}
                transparent
                animationType="fade"
                onRequestClose={() => setDeletingChannel(null)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setDeletingChannel(null)}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <ThemedView
                            type="card"
                            style={[
                                styles.modalCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="smallBold">Delete channel</ThemedText>
                            <ThemedText themeColor="mutedForeground">
                                Are you sure you want to delete{" "}
                                <ThemedText type="smallBold">
                                    #{deletingChannel?.name}
                                </ThemedText>
                                ? This action cannot be undone.
                            </ThemedText>
                            {actionError ? (
                                <ThemedText themeColor="destructive">
                                    {actionError}
                                </ThemedText>
                            ) : null}
                            <View style={styles.modalActions}>
                                <ActionButton
                                    label="Cancel"
                                    tone="ghost"
                                    onPress={() => setDeletingChannel(null)}
                                />
                                <ActionButton
                                    label={saving ? "Deleting…" : "Delete"}
                                    tone="danger"
                                    disabled={saving}
                                    onPress={() => void handleDelete()}
                                />
                            </View>
                        </ThemedView>
                    </View>
                </Pressable>
            </Modal>
        </AuthRouteGuard>
    );
}

function ChannelSection({
    title,
    channels,
    onEdit,
    onDelete,
}: {
    title: string;
    channels: Channel[];
    onEdit: (channel: Channel) => void;
    onDelete: (channel: Channel) => void;
}) {
    const theme = useTheme();
    return (
        <ThemedView
            type="card"
            style={[styles.card, { borderColor: theme.border }]}
        >
            <View style={styles.sectionHeaderRow}>
                <ThemedText type="smallBold">{title}</ThemedText>
                <ThemedText type="code" themeColor="mutedForeground">
                    {channels.length}
                </ThemedText>
            </View>
            <View style={styles.channelList}>
                {channels.map((channel) => (
                    <ChannelRow
                        key={channel.$id ?? channel.name}
                        channel={channel}
                        onEdit={() => onEdit(channel)}
                        onDelete={() => onDelete(channel)}
                    />
                ))}
            </View>
        </ThemedView>
    );
}

function ChannelRow({
    channel,
    onEdit,
    onDelete,
}: {
    channel: Channel;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <View style={styles.channelRow}>
            <View style={styles.channelInfo}>
                <View style={styles.channelTitleRow}>
                    <ThemedText type="smallBold">
                        #{channel.name ?? "unnamed"}
                    </ThemedText>
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
                    <ThemedText
                        themeColor="mutedForeground"
                        style={styles.channelTopic}
                        numberOfLines={1}
                    >
                        {channel.topic}
                    </ThemedText>
                ) : null}
                <View style={styles.channelMeta}>
                    {channel.memberCount != null ? (
                        <ThemedText type="code" themeColor="mutedForeground">
                            {channel.memberCount} members
                        </ThemedText>
                    ) : null}
                    {channel.isPrivate ? (
                        <StatusPill label="private" tone="warning" />
                    ) : null}
                </View>
            </View>
            <View style={styles.channelActions}>
                <ActionButton label="Edit" tone="secondary" onPress={onEdit} />
                <ActionButton label="Delete" tone="danger" onPress={onDelete} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
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
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
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
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    actionRow: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
    },
    channelList: { gap: Spacing.two },
    channelRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: Spacing.two,
    },
    channelInfo: { flex: 1, gap: 4 },
    channelTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    channelTopic: { fontSize: 13, lineHeight: 18 },
    channelMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        flexWrap: "wrap",
    },
    channelActions: {
        flexDirection: "row",
        gap: Spacing.one,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    actionButton: {
        minHeight: 36,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.three,
        borderWidth: 1,
    },
    actionButtonPressed: { opacity: 0.85 },
    actionButtonDisabled: { opacity: 0.5 },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalAnchor: {
        width: "100%",
        maxWidth: 420,
        paddingHorizontal: Spacing.three,
    },
    modalCard: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    input: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 48,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 16,
    },
    typeRow: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    typePill: {
        flex: 1,
        minHeight: 40,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
    },
    modalActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: Spacing.two,
    },
});
