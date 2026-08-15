import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { fetchMyServers, type Server } from "@/lib/firepit";

function actionToneToViewType(tone: "primary" | "secondary" | "ghost") {
    if (tone === "primary") return "primary";
    if (tone === "secondary") return "secondary";
    return "muted";
}

function AdminRow({
    title,
    description,
    actionLabel,
    actionTone = "primary",
    onAction,
}: {
    title: string;
    description: string;
    actionLabel: string;
    actionTone?: "primary" | "secondary" | "ghost";
    onAction: () => void;
}) {
    return (
        <View style={styles.row}>
            <View style={styles.rowText}>
                <ThemedText type="smallBold">{title}</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                    {description}
                </ThemedText>
            </View>
            <Pressable
                onPress={onAction}
                style={({ pressed }) => [
                    styles.actionButton,
                    { opacity: pressed ? 0.85 : 1 },
                ]}
            >
                <ThemedView
                    type={actionToneToViewType(actionTone)}
                    style={styles.actionButtonInner}
                >
                    <ThemedText
                        type="smallBold"
                        themeColor={actionTone === "primary" ? "primaryForeground" : "foreground"}
                    >
                        {actionLabel}
                    </ThemedText>
                </ThemedView>
            </Pressable>
        </View>
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

function ServerCard({
    server,
    selected,
    onSelect,
}: {
    server: Server;
    selected: boolean;
    onSelect: () => void;
}) {
    const theme = useTheme();
    return (
        <Pressable
            onPress={onSelect}
            style={[
                styles.serverCard,
                {
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.secondary : theme.card,
                },
            ]}
        >
            <ThemedText type="smallBold">{server.name ?? "Unnamed server"}</ThemedText>
            {server.memberCount != null && (
                <ThemedText type="code" themeColor="mutedForeground">
                    {server.memberCount} members
                </ThemedText>
            )}
        </Pressable>
    );
}

export default function AdminTabScreen() {
    const theme = useTheme();
    const { currentUser, instanceUrl, accessToken, state } = useFirepitBootstrap();
    const { serverId: paramServerId } = useLocalSearchParams<{ serverId?: string }>();

    const [servers, setServers] = useState<Server[]>([]);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

    const roles = currentUser?.roles as Record<string, unknown> | undefined;
    const isGlobalAdmin = roles?.isAdmin === true;
    const isGlobalMod = roles?.isModerator === true;
    const hasGlobalAccess = isGlobalAdmin || isGlobalMod;

    const serverId = selectedServerId ?? paramServerId;

    const loadServers = useCallback(async () => {
        if (state !== "ready" || !instanceUrl || !accessToken) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchMyServers(instanceUrl, accessToken);
            setServers(res.servers ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load servers",
            );
        }
    }, [accessToken, instanceUrl, state]);

    useEffect(() => {
        void loadServers();
    }, [loadServers]);

    useRetryOnReconnect(loadState === "error", loadServers);

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
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
                    contentContainerStyle={styles.shell}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.header}>
                        <ThemedText type="code" themeColor="accent">
                            Firepit admin
                        </ThemedText>
                        <ThemedText type="title">Administrative tools</ThemedText>
                        <ThemedText themeColor="mutedForeground" style={styles.copy}>
                            Server management, moderation actions, and audit logs.
                        </ThemedText>
                        <View style={styles.pillRow}>
                            {hasGlobalAccess ? <StatusPill label="instance" tone="warning" /> : null}
                        </View>
                    </View>

                    {/* Server list */}
                    {loadState === "loading" ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={theme.primary} />
                            <ThemedText themeColor="mutedForeground">
                                Loading your servers…
                            </ThemedText>
                        </View>
                    ) : null}

                    {loadError ? (
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText themeColor="destructive">{loadError}</ThemedText>
                        </ThemedView>
                    ) : null}

                    {loadState === "ready" && servers.length > 0 ? (
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Your servers</ThemedText>
                            <View style={styles.serverGrid}>
                                {servers.map((server) => (
                                    <ServerCard
                                        key={server.$id}
                                        server={server}
                                        selected={server.$id === serverId}
                                        onSelect={() => setSelectedServerId(server.$id ?? null)}
                                    />
                                ))}
                            </View>
                        </ThemedView>
                    ) : null}

                    {/* Instance-wide tools for global admins/mods */}
                    {hasGlobalAccess ? (
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Instance tools</ThemedText>
                            <AdminRow
                                title="Instance audit log"
                                description="View every privileged action across all servers."
                                actionLabel="Open audit log"
                                actionTone="secondary"
                                onAction={() =>
                                    router.push("/admin/instance-audit-log" as never)
                                }
                            />
                            <AdminRow
                                title="Reports"
                                description="Review reports submitted by users for inappropriate content."
                                actionLabel="Open reports"
                                actionTone="secondary"
                                onAction={() =>
                                    router.push("/admin/instance-reports" as never)
                                }
                            />
                            <AdminRow
                                title="Announcements"
                                description="Compose and send system-wide announcements to all users."
                                actionLabel="Open announcements"
                                actionTone="ghost"
                                onAction={() =>
                                    router.push("/admin/instance-announcements" as never)
                                }
                            />
                        </ThemedView>
                    ) : null}

                    {/* Server tools for selected server */}
                    {serverId ? (
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Server tools</ThemedText>
                            <AdminRow
                                title="Server admin"
                                description="View stats, manage channels, roles, and server settings."
                                actionLabel="Open admin dashboard"
                                onAction={() =>
                                    router.push(`/server/${serverId}` as never)
                                }
                            />
                            <AdminRow
                                title="Moderation"
                                description="Ban, mute, and kick members. Review and manage reports."
                                actionLabel="Open moderation"
                                actionTone="secondary"
                                onAction={() =>
                                    router.push(
                                        `/admin/reports?serverId=${serverId}` as never,
                                    )
                                }
                            />
                            <AdminRow
                                title="Audit log"
                                description="Review moderation actions and server changes."
                                actionLabel="Open audit log"
                                actionTone="ghost"
                                onAction={() =>
                                    router.push(
                                        `/admin/audit-log?serverId=${serverId}` as never,
                                    )
                                }
                            />
                        </ThemedView>
                    ) : null}

                    {!serverId && !hasGlobalAccess && loadState === "ready" && servers.length === 0 ? (
                        <View style={styles.row}>
                            <View style={styles.rowText}>
                                <ThemedText type="smallBold">No servers found</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    You are not a member of any servers. Join or create a
                                    server to access admin tools.
                                </ThemedText>
                            </View>
                        </View>
                    ) : null}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: "hidden" },
    scrollView: { flex: 1 },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.two,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.two,
        paddingBottom: BottomTabInset + Spacing.five,
    },
    header: {
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.one,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.half,
    },
    row: {
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.two,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    rowText: {
        gap: Spacing.half,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    actionButton: {
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    actionButtonInner: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    serverCard: {
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.half,
        borderWidth: 1,
        minWidth: 140,
    },
    serverGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
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
