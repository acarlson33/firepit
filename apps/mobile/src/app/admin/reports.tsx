import { router, useLocalSearchParams } from "expo-router";
import { useState, useCallback, useEffect } from "react";
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
import { StatusPill } from "@/components/action-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    fetchRoleAssignments,
    moderateServerMember,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

type MemberInfo = {
    userId: string;
    displayName?: string;
    userName?: string;
    avatarUrl?: string;
    roleIds?: string[];
};

type ModerationAction = "ban" | "mute" | "kick" | "unban" | "unmute";

const ACTION_META: Record<ModerationAction, { label: string; tone: "danger" | "warning" | "neutral"; description: string }> = {
    ban: { label: "Ban", tone: "danger", description: "Permanently remove and block the user from the server" },
    unban: { label: "Unban", tone: "neutral", description: "Remove the ban so the user can rejoin" },
    mute: { label: "Mute", tone: "warning", description: "Prevent the user from sending messages" },
    unmute: { label: "Unmute", tone: "neutral", description: "Allow the user to send messages again" },
    kick: { label: "Kick", tone: "warning", description: "Remove the user from the server (they can rejoin)" },
};

function ActionButton({
    label,
    onPress,
    disabled,
    tone = "primary",
    accessibilityLabel,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: "primary" | "secondary" | "ghost" | "danger" | "warning" | "neutral";
    accessibilityLabel?: string;
}) {
    const theme = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor:
                        tone === "danger"
                            ? theme.destructive
                            : tone === "warning"
                              ? theme.secondary
                              : tone === "primary"
                                ? theme.primary
                                : tone === "secondary"
                                  ? theme.secondary
                                  : theme.muted,
                    borderColor:
                        tone === "danger" ? theme.destructive : theme.border,
                },
                pressed && !disabled && styles.actionButtonPressed,
                disabled && styles.actionButtonDisabled,
            ]}
        >
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
        </Pressable>
    );
}

export default function ModerationScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();

    const [members, setMembers] = useState<MemberInfo[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Action modal
    const [targetMember, setTargetMember] = useState<MemberInfo | null>(null);
    const [action, setAction] = useState<ModerationAction>("ban");
    const [reason, setReason] = useState("");
    const [showAction, setShowAction] = useState(false);
    const [actionResult, setActionResult] = useState<string | null>(null);

    const loadMembers = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchRoleAssignments(instanceUrl, accessToken, {
                serverId,
            });
            setMembers(res.members ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load members",
            );
        }
    }, [accessToken, instanceUrl, serverId]);

    useEffect(() => {
        void loadMembers();
    }, [loadMembers]);

    useRetryOnReconnect(loadState === "error", loadMembers);

    if (!serverId) {
        return (
            <AuthRouteGuard>
                <View style={[styles.root, { backgroundColor: theme.background }]}>
                    <View style={styles.centerShell}>
                        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                            <ThemedText type="title">No server selected</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={{ fontSize: 14, lineHeight: 20, marginTop: Spacing.one }}>
                                Select a server from the admin dashboard to moderate its members.
                            </ThemedText>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={({ pressed }) => [
                                    {
                                        borderRadius: 999,
                                        paddingHorizontal: Spacing.three,
                                        paddingVertical: Spacing.two,
                                        backgroundColor: theme.primary,
                                        marginTop: Spacing.three,
                                        alignItems: "center",
                                        opacity: pressed ? 0.85 : 1,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryForeground">
                                    Go back
                                </ThemedText>
                            </Pressable>
                        </ThemedView>
                    </View>
                </View>
            </AuthRouteGuard>
        );
    }

    const executeAction = async () => {
        if (!instanceUrl || !accessToken || !targetMember || !serverId || saving) return;
        setSaving(true);
        setActionResult(null);
        try {
            await moderateServerMember(
                instanceUrl,
                accessToken,
                serverId,
                action,
                targetMember.userId,
                reason.trim() || undefined,
            );
            setActionResult(`${ACTION_META[action].label} succeeded for ${targetMember.displayName ?? targetMember.userId}`);
            setShowAction(false);
            setTargetMember(null);
            setReason("");
        } catch (error) {
            setActionResult(
                error instanceof Error
                    ? error.message
                    : `Unable to ${action} user`,
            );
        } finally {
            setSaving(false);
        }
    };

    const openAction = (member: MemberInfo, act: ModerationAction) => {
        setTargetMember(member);
        setAction(act);
        setReason("");
        setActionResult(null);
        setShowAction(true);
    };

    return (
        <AuthRouteGuard>
            <View style={styles.root}>
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
                <ScrollView
                    style={[styles.scrollView, { backgroundColor: theme.background }]}
                    contentContainerStyle={styles.scrollContent}
                >
                    <SafeAreaView style={styles.safeArea}>
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Moderation
                            </ThemedText>
                            <ThemedText type="title">Member moderation</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Ban, mute, or kick members. Actions are logged in the audit log.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        loadState === "ready"
                                            ? `${members.length} members`
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

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">Actions</ThemedText>
                                <View style={styles.actionRow}>
                                    <ActionButton
                                        label="Dashboard"
                                        tone="ghost"
                                        onPress={() =>
                                            router.push(`/admin?serverId=${serverId}` as never)
                                        }
                                    />
                                    <ActionButton
                                        label="Audit log"
                                        tone="ghost"
                                        onPress={() =>
                                            router.push(`/admin/audit-log?serverId=${serverId}` as never)
                                        }
                                    />
                                    <ActionButton
                                        label="Refresh"
                                        tone="secondary"
                                        onPress={() => void loadMembers()}
                                    />
                                </View>
                            </View>
                            {loadError ? (
                                <ThemedText themeColor="destructive">{loadError}</ThemedText>
                            ) : null}
                        </ThemedView>

                        {loadState === "loading" ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color={theme.primary} />
                                <ThemedText themeColor="mutedForeground">
                                    Loading members…
                                </ThemedText>
                            </View>
                        ) : null}

                        {loadState === "ready" && members.length === 0 ? (
                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText themeColor="mutedForeground">
                                    No members loaded.
                                </ThemedText>
                            </ThemedView>
                        ) : null}

                        {members.map((member) => (
                            <MemberRow
                                key={member.userId}
                                member={member}
                                onAction={openAction}
                            />
                        ))}
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
            </View>

            {/* Action modal */}
            <Modal
                visible={showAction}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAction(false)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setShowAction(false)}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <ThemedView
                            type="card"
                            style={[styles.modalCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">
                                {ACTION_META[action].label} member
                            </ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                {ACTION_META[action].description}
                            </ThemedText>
                            <ThemedText style={styles.targetName}>
                                {targetMember?.displayName ?? targetMember?.userId}
                            </ThemedText>
                            <TextInput
                                placeholder="Reason (optional)"
                                placeholderTextColor={theme.mutedForeground}
                                value={reason}
                                onChangeText={setReason}
                                multiline
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.input,
                                        color: theme.foreground,
                                    },
                                ]}
                            />
                            {actionResult ? (
                                <ThemedText
                                    themeColor={
                                        actionResult.includes("succeeded")
                                            ? "accent"
                                            : "destructive"
                                    }
                                >
                                    {actionResult}
                                </ThemedText>
                            ) : null}
                            <View style={styles.modalActions}>
                                <ActionButton
                                    label="Cancel"
                                    tone="ghost"
                                    onPress={() => setShowAction(false)}
                                />
                                <ActionButton
                                    label={saving ? "Processing…" : ACTION_META[action].label}
                                    tone={ACTION_META[action].tone}
                                    disabled={saving}
                                    onPress={() => void executeAction()}
                                />
                            </View>
                        </ThemedView>
                    </View>
                </Pressable>
            </Modal>
        </AuthRouteGuard>
    );
}

function MemberRow({
    member,
    onAction,
}: {
    member: MemberInfo;
    onAction: (member: MemberInfo, action: ModerationAction) => void;
}) {
    const theme = useTheme();
    const name = member.displayName ?? member.userName ?? member.userId;
    const initial = name.slice(0, 1).toUpperCase();

    return (
        <ThemedView
            type="card"
            style={[styles.card, { borderColor: theme.border }]}
        >
            <View style={styles.memberHeader}>
                <View style={styles.memberInfo}>
                    <View style={styles.avatarShell}>
                        <ThemedText type="smallBold">{initial}</ThemedText>
                    </View>
                    <View style={styles.memberCopy}>
                        <ThemedText type="smallBold">{name}</ThemedText>
                        {member.userName && member.userName !== name ? (
                            <ThemedText type="code" themeColor="mutedForeground">
                                @{member.userName}
                            </ThemedText>
                        ) : null}
                        <ThemedText type="code" themeColor="mutedForeground">
                            {member.userId}
                        </ThemedText>
                    </View>
                </View>
            </View>

            {member.roleIds && member.roleIds.length > 0 ? (
                <View style={styles.rolePills}>
                    {member.roleIds.map((roleId) => (
                        <StatusPill key={roleId} label={roleId} tone="neutral" />
                    ))}
                </View>
            ) : null}

            <View style={styles.moderationActions}>
                <ActionButton
                    label="Ban"
                    tone="danger"
                    onPress={() => onAction(member, "ban")}
                    accessibilityLabel={`Ban ${name}`}
                />
                <ActionButton
                    label="Kick"
                    tone="warning"
                    onPress={() => onAction(member, "kick")}
                    accessibilityLabel={`Kick ${name}`}
                />
                <ActionButton
                    label="Mute"
                    tone="warning"
                    onPress={() => onAction(member, "mute")}
                    accessibilityLabel={`Mute ${name}`}
                />
                <ActionButton
                    label="Unban"
                    tone="secondary"
                    onPress={() => onAction(member, "unban")}
                    accessibilityLabel={`Unban ${name}`}
                />
                <ActionButton
                    label="Unmute"
                    tone="secondary"
                    onPress={() => onAction(member, "unmute")}
                    accessibilityLabel={`Unmute ${name}`}
                />
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: "hidden" },
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    centerShell: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.three,
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
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
    },
    actionButton: {
        minHeight: 36,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    actionButtonPressed: { opacity: 0.85 },
    actionButtonDisabled: { opacity: 0.5 },
    memberHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    memberInfo: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    avatarShell: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(217, 121, 43, 0.14)",
    },
    memberCopy: { flex: 1, gap: 2 },
    rolePills: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    moderationActions: {
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
        maxWidth: 420,
        paddingHorizontal: Spacing.three,
    },
    modalCard: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    targetName: {
        fontSize: 16,
        fontWeight: "600",
    },
    input: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 80,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 15,
        textAlignVertical: "top",
    },
    modalActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: Spacing.two,
    },
});
