import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createServerRole,
    deleteServerRole,
    fetchServerRoles,
    updateServerRole,
    type ServerRole,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

const PERMISSION_FLAGS: { key: string; label: string }[] = [
    { key: "readMessages", label: "Read messages" },
    { key: "sendMessages", label: "Send messages" },
    { key: "manageMessages", label: "Manage messages" },
    { key: "manageChannels", label: "Manage channels" },
    { key: "manageRoles", label: "Manage roles" },
    { key: "manageServer", label: "Manage server" },
    { key: "mentionEveryone", label: "Mention @everyone" },
    { key: "administrator", label: "Administrator" },
];

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
                {icon === "back" && <ArrowLeft size={16} color={tone === "primary" || tone === "danger" ? theme.primaryForeground : theme.foreground} />}
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

type RoleDraft = {
    name: string;
    color: string;
    mentionable: boolean;
    defaultOnJoin: boolean;
    readMessages: boolean;
    sendMessages: boolean;
    manageMessages: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    manageServer: boolean;
    mentionEveryone: boolean;
    administrator: boolean;
};

const EMPTY_DRAFT: RoleDraft = {
    name: "",
    color: "#99AAB5",
    mentionable: false,
    defaultOnJoin: false,
    readMessages: true,
    sendMessages: true,
    manageMessages: false,
    manageChannels: false,
    manageRoles: false,
    manageServer: false,
    mentionEveryone: false,
    administrator: false,
};

function draftFromRole(role: ServerRole): RoleDraft {
    return {
        name: role.name ?? "",
        color: role.color ?? "#99AAB5",
        mentionable: role.mentionable ?? false,
        defaultOnJoin: role.defaultOnJoin ?? false,
        readMessages: role.readMessages ?? true,
        sendMessages: role.sendMessages ?? true,
        manageMessages: role.manageMessages ?? false,
        manageChannels: role.manageChannels ?? false,
        manageRoles: role.manageRoles ?? false,
        manageServer: role.manageServer ?? false,
        mentionEveryone: role.mentionEveryone ?? false,
        administrator: role.administrator ?? false,
    };
}

export default function RolesManagementScreen() {
    const theme = useTheme();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [roles, setRoles] = useState<ServerRole[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Create modal
    const [createDraft, setCreateDraft] = useState<RoleDraft>(EMPTY_DRAFT);
    const [showCreate, setShowCreate] = useState(false);

    // Edit modal
    const [editingRole, setEditingRole] = useState<ServerRole | null>(null);
    const [editDraft, setEditDraft] = useState<RoleDraft>(EMPTY_DRAFT);
    const [showEdit, setShowEdit] = useState(false);

    // Delete confirmation
    const [deletingRole, setDeletingRole] = useState<ServerRole | null>(null);

    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;

    const loadRoles = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }

        setLoadState("loading");
        setLoadError(null);

        try {
            const response = await fetchServerRoles(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setRoles(response.roles ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load roles",
            );
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    useEffect(() => {
        void loadRoles();
    }, [loadRoles]);

    useRetryOnReconnect(loadState === "error", loadRoles);

    const handleCreate = async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId || saving) return;
        const name = createDraft.name.trim();
        if (!name) return;

        setSaving(true);
        setActionError(null);
        try {
            await createServerRole(instanceUrl, accessToken, {
                serverId: normalizedServerId,
                name,
                color: createDraft.color.trim() || undefined,
                mentionable: createDraft.mentionable,
                defaultOnJoin: createDraft.defaultOnJoin,
                readMessages: createDraft.readMessages,
                sendMessages: createDraft.sendMessages,
                manageMessages: createDraft.manageMessages,
                manageChannels: createDraft.manageChannels,
                manageRoles: createDraft.manageRoles,
                manageServer: createDraft.manageServer,
                mentionEveryone: createDraft.mentionEveryone,
                administrator: createDraft.administrator,
            });
            setShowCreate(false);
            setCreateDraft(EMPTY_DRAFT);
            await loadRoles();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to create role",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!instanceUrl || !accessToken || !editingRole || saving) return;
        const roleId = editingRole.$id;
        if (!roleId) return;
        const name = editDraft.name.trim();
        if (!name) return;

        setSaving(true);
        setActionError(null);
        try {
            await updateServerRole(instanceUrl, accessToken, {
                $id: roleId,
                name,
                color: editDraft.color.trim() || undefined,
                mentionable: editDraft.mentionable,
                defaultOnJoin: editDraft.defaultOnJoin,
                readMessages: editDraft.readMessages,
                sendMessages: editDraft.sendMessages,
                manageMessages: editDraft.manageMessages,
                manageChannels: editDraft.manageChannels,
                manageRoles: editDraft.manageRoles,
                manageServer: editDraft.manageServer,
                mentionEveryone: editDraft.mentionEveryone,
                administrator: editDraft.administrator,
            });
            setShowEdit(false);
            setEditingRole(null);
            await loadRoles();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to update role",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!instanceUrl || !accessToken || !deletingRole || saving) return;
        const roleId = deletingRole.$id;
        if (!roleId) return;

        setSaving(true);
        setActionError(null);
        try {
            await deleteServerRole(
                instanceUrl,
                accessToken,
                roleId,
            );
            setDeletingRole(null);
            await loadRoles();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : "Unable to delete role",
            );
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (role: ServerRole) => {
        setEditingRole(role);
        setEditDraft(draftFromRole(role));
        setActionError(null);
        setShowEdit(true);
    };

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
                                Role management
                            </ThemedText>
                            <ThemedText type="title">
                                Manage roles and permissions
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Create roles with specific permissions. Members with
                                the Manage Roles permission can assign roles to others.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${roles.length} roles`
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
                                        label="Create role"
                                        onPress={() => {
                                            setActionError(null);
                                            setCreateDraft(EMPTY_DRAFT);
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

                        {/* Role list */}
                        {loadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading roles…
                                </ThemedText>
                            </View>
                        ) : null}

                        {loadState === "ready" && roles.length === 0 ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText themeColor="mutedForeground">
                                    No custom roles found. Create the first one to manage
                                    permissions.
                                </ThemedText>
                            </ThemedView>
                        ) : null}

                        {roles.map((role) => (
                            <RoleCard
                                key={role.$id ?? role.name}
                                role={role}
                                onEdit={() => openEdit(role)}
                                onDelete={() => setDeletingRole(role)}
                            />
                        ))}
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>

            {/* Create modal */}
            <RoleEditorModal
                visible={showCreate}
                title="Create role"
                draft={createDraft}
                onDraftChange={setCreateDraft}
                saving={saving}
                submitLabel="Create"
                error={actionError}
                onSubmit={() => void handleCreate()}
                onClose={() => {
                    setActionError(null);
                    setShowCreate(false);
                }}
            />

            {/* Edit modal */}
            <RoleEditorModal
                visible={showEdit}
                title="Edit role"
                draft={editDraft}
                onDraftChange={setEditDraft}
                saving={saving}
                submitLabel="Save"
                error={actionError}
                onSubmit={() => void handleEdit()}
                onClose={() => {
                    setActionError(null);
                    setShowEdit(false);
                }}
            />

            {/* Delete confirmation modal */}
            <Modal
                visible={Boolean(deletingRole)}
                transparent
                animationType="fade"
                onRequestClose={() => setDeletingRole(null)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setDeletingRole(null)}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <Pressable onPress={() => undefined}>
                            <ThemedView
                                type="card"
                                style={[
                                    styles.modalCard,
                                    { borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="smallBold">Delete role</ThemedText>
                                <ThemedText themeColor="mutedForeground">
                                    Are you sure you want to delete the role{" "}
                                    <ThemedText type="smallBold">
                                        {deletingRole?.name}
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
                                        onPress={() => {
                                            setActionError(null);
                                            setDeletingRole(null);
                                        }}
                                    />
                                    <ActionButton
                                        label={saving ? "Deleting…" : "Delete"}
                                        tone="danger"
                                        disabled={saving}
                                        onPress={() => void handleDelete()}
                                    />
                                </View>
                            </ThemedView>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>
        </AuthRouteGuard>
    );
}

function RoleCard({
    role,
    onEdit,
    onDelete,
}: {
    role: ServerRole;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const theme = useTheme();
    const enabledPerms = PERMISSION_FLAGS.filter(
        (f) => role[f.key as keyof ServerRole],
    );

    return (
        <ThemedView
            type="card"
            style={[styles.card, { borderColor: theme.border }]}
        >
            <View style={styles.roleHeader}>
                <View style={styles.roleTitleRow}>
                    <View
                        style={[
                            styles.roleColorDot,
                            { backgroundColor: role.color ?? "#99AAB5" },
                        ]}
                    />
                    <ThemedText type="smallBold">
                        {role.name ?? "Unnamed role"}
                    </ThemedText>
                </View>
                <View style={styles.roleActions}>
                    <ActionButton label="Edit" tone="secondary" onPress={onEdit} />
                    <ActionButton
                        label="Delete"
                        tone="danger"
                        onPress={onDelete}
                    />
                </View>
            </View>

            <View style={styles.roleMeta}>
                {role.mentionable ? (
                    <StatusPill label="mentionable" tone="success" />
                ) : null}
                {role.defaultOnJoin ? (
                    <StatusPill label="default on join" tone="neutral" />
                ) : null}
                {role.administrator ? (
                    <StatusPill label="administrator" tone="danger" />
                ) : null}
            </View>

            {enabledPerms.length > 0 ? (
                <View style={styles.permList}>
                    <ThemedText
                        type="code"
                        themeColor="mutedForeground"
                        style={styles.permLabel}
                    >
                        Permissions
                    </ThemedText>
                    <View style={styles.permPills}>
                        {enabledPerms.map((perm) => (
                            <StatusPill
                                key={perm.key}
                                label={perm.label}
                                tone="neutral"
                            />
                        ))}
                    </View>
                </View>
            ) : (
                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                    No special permissions granted.
                </ThemedText>
            )}
        </ThemedView>
    );
}

function RoleEditorModal({
    visible,
    title,
    draft,
    onDraftChange,
    saving,
    submitLabel,
    error,
    onSubmit,
    onClose,
}: {
    visible: boolean;
    title: string;
    draft: RoleDraft;
    onDraftChange: (draft: RoleDraft) => void;
    saving: boolean;
    submitLabel: string;
    error: string | null;
    onSubmit: () => void;
    onClose: () => void;
}) {
    const theme = useTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.modalBackdrop} onPress={onClose}>
                <View pointerEvents="box-none" style={styles.modalAnchor}>
                    <ScrollView
                        style={styles.modalScroll}
                        contentContainerStyle={styles.modalScrollContent}
                    >
                        <ThemedView
                            type="card"
                            style={[
                                styles.modalCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <ThemedText type="smallBold">{title}</ThemedText>

                            {error ? (
                                <ThemedText themeColor="destructive">
                                    {error}
                                </ThemedText>
                            ) : null}

                            <TextInput
                                autoCapitalize="words"
                                autoCorrect={false}
                                placeholder="Role name"
                                placeholderTextColor={theme.mutedForeground}
                                value={draft.name}
                                onChangeText={(text) =>
                                    onDraftChange({ ...draft, name: text })
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

                            <TextInput
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder="Color hex, e.g. #FF5500"
                                placeholderTextColor={theme.mutedForeground}
                                value={draft.color}
                                onChangeText={(text) =>
                                    onDraftChange({ ...draft, color: text })
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

                            <View style={styles.toggleSection}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    Role settings
                                </ThemedText>
                                <ToggleRow
                                    label="Mentionable"
                                    value={draft.mentionable}
                                    onValueChange={(v) =>
                                        onDraftChange({ ...draft, mentionable: v })
                                    }
                                />
                                <ToggleRow
                                    label="Default on join"
                                    value={draft.defaultOnJoin}
                                    onValueChange={(v) =>
                                        onDraftChange({ ...draft, defaultOnJoin: v })
                                    }
                                />
                            </View>

                            <View style={styles.toggleSection}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    Permissions
                                </ThemedText>
                                {PERMISSION_FLAGS.map((perm) => (
                                    <ToggleRow
                                        key={perm.key}
                                        label={perm.label}
                                        value={
                                            draft[
                                                perm.key as keyof RoleDraft
                                            ] as boolean
                                        }
                                        onValueChange={(v) =>
                                            onDraftChange({ ...draft, [perm.key]: v })
                                        }
                                    />
                                ))}
                            </View>

                            <View style={styles.modalActions}>
                                <ActionButton
                                    label="Cancel"
                                    tone="ghost"
                                    onPress={onClose}
                                />
                                <ActionButton
                                    label={saving ? "Saving…" : submitLabel}
                                    disabled={saving || !draft.name.trim()}
                                    onPress={onSubmit}
                                />
                            </View>
                        </ThemedView>
                    </ScrollView>
                </View>
            </Pressable>
        </Modal>
    );
}

function ToggleRow({
    label,
    value,
    onValueChange,
}: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
}) {
    const theme = useTheme();
    return (
        <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: theme.muted, true: theme.primary }}
                thumbColor={value ? theme.primaryForeground : theme.card}
            />
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
    roleHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    roleTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        flex: 1,
    },
    roleColorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    roleActions: {
        flexDirection: "row",
        gap: Spacing.one,
    },
    roleMeta: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    permList: { gap: Spacing.one },
    permLabel: { fontSize: 12 },
    permPills: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalAnchor: {
        width: "100%",
        maxWidth: 480,
        paddingHorizontal: Spacing.three,
        maxHeight: "90%",
    },
    modalScroll: { maxHeight: "100%" },
    modalScrollContent: { paddingVertical: Spacing.two },
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
    toggleSection: { gap: Spacing.two },
    toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.one,
    },
    toggleLabel: { flex: 1 },
    modalActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: Spacing.two,
    },
});
