import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchMyServers, type Server } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type StatusTone = "neutral" | "success" | "warning" | "danger";

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
                    borderColor:
                        tone === "primary" ? theme.primary : theme.border,
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

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
    return (
        <ThemedView
            type={tone === "neutral" ? "muted" : tone}
            style={styles.pill}
        >
            <ThemedText
                type="code"
                themeColor={tone === "neutral" ? "mutedForeground" : "foreground"}
            >
                {label}
            </ThemedText>
        </ThemedView>
    );
}

function useProfileSummary() {
    const { currentUser, state, signOut, accessToken, instanceUrl } =
        useFirepitBootstrap();

    const username = useMemo(() => {
        return (
            currentUser?.displayName ??
            currentUser?.userName ??
            currentUser?.name ??
            currentUser?.email ??
            currentUser?.$id ??
            "You"
        );
    }, [currentUser]);

    const statusLabel = useMemo(() => {
        if (state === "ready" && accessToken) {
            return "online";
        }
        if (state === "needs-auth") {
            return "needs login";
        }
        if (state === "incompatible") {
            return "blocked";
        }
        if (!instanceUrl) {
            return "no instance";
        }
        return state;
    }, [accessToken, instanceUrl, state]);

    const statusTone: StatusTone =
        state === "ready"
            ? "success"
            : state === "needs-auth"
              ? "warning"
              : state === "incompatible"
                ? "danger"
                : "neutral";

    return {
        currentUser,
        signOut,
        username,
        statusLabel,
        statusTone,
    };
}

function ProfileMenu() {
    const { currentUser, signOut, username, statusLabel, statusTone } =
        useProfileSummary();
    const theme = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile menu"
                onPress={() => setIsOpen(true)}
                style={({ pressed }) => [
                    styles.profileButton,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        opacity: pressed ? 0.88 : 1,
                    },
                ]}
            >
                <ThemedText type="smallBold">
                    {username.slice(0, 1).toUpperCase()}
                </ThemedText>
            </Pressable>

            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsOpen(false)}
            >
                <Pressable
                    accessibilityRole="button"
                    onPress={() => setIsOpen(false)}
                    style={styles.modalBackdrop}
                >
                    <View pointerEvents="box-none" style={styles.modalAnchor}>
                        <View
                            accessibilityRole="menu"
                            style={[
                                styles.menuCard,
                                {
                                    backgroundColor: theme.card,
                                    borderColor: theme.border,
                                },
                            ]}
                        >
                            <View style={styles.menuHeader}>
                                <View style={styles.avatarCircle}>
                                    <ThemedText type="smallBold">
                                        {username.slice(0, 1).toUpperCase()}
                                    </ThemedText>
                                </View>
                                <View style={styles.menuHeaderCopy}>
                                    <ThemedText type="smallBold">
                                        {username}
                                    </ThemedText>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.metaText}
                                    >
                                        Signed in with your Firepit account
                                    </ThemedText>
                                </View>
                            </View>

                            <View style={styles.menuBody}>
                                <StatusPill label={statusLabel} tone={statusTone} />
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                    style={styles.metaText}
                                >
                                    {currentUser?.email ?? currentUser?.$id ?? "No email"}
                                </ThemedText>
                            </View>

                            <View style={styles.menuActions}>
                                <ActionButton
                                    label="Sign out"
                                    tone="ghost"
                                    onPress={async () => {
                                        setIsOpen(false);
                                        await signOut();
                                        router.replace("/login");
                                    }}
                                />
                            </View>
                        </View>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

function useJoinedServers() {
    const { instanceUrl, accessToken, state } = useFirepitBootstrap();
    const [servers, setServers] = useState<(Server & { $id: string })[]>([]);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (state !== "ready" || !instanceUrl || !accessToken) {
            setServers([]);
            setLoadState("idle");
            setLoadError(null);
            return;
        }

        setLoadState("loading");
        setLoadError(null);

        try {
            const nextServers = await fetchMyServers(instanceUrl, accessToken);
            const selectableServers = (nextServers.servers ?? []).filter(
                (server): server is Server & { $id: string } =>
                    typeof server.$id === "string" && server.$id.length > 0,
            );
            setServers(selectableServers);
            setLoadState("ready");
        } catch (error) {
            setServers([]);
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load joined servers",
            );
        }
    }, [accessToken, instanceUrl, state]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { servers, loadState, loadError, refresh };
}

export default function HomeTabScreen() {
    const {
        state,
        instanceUrl,
        compatibility,
        version,
        accessToken,
        currentUser,
        featureFlags,
    } = useFirepitBootstrap();
    const theme = useTheme();
    const { servers, loadState, loadError, refresh } = useJoinedServers();

    const username = useMemo(() => {
        return (
            currentUser?.displayName ??
            currentUser?.userName ??
            currentUser?.name ??
            currentUser?.email ??
            currentUser?.$id ??
            "You"
        );
    }, [currentUser]);

    const signedIn = state === "ready" && Boolean(currentUser && accessToken);

    const statusLabel = useMemo(() => {
        if (signedIn) {
            return "online";
        }
        if (state === "needs-auth") {
            return "needs login";
        }
        if (state === "incompatible") {
            return "blocked";
        }
        return state;
    }, [signedIn, state]);

    const statusTone: StatusTone =
        state === "ready"
            ? "success"
            : state === "needs-auth"
              ? "warning"
              : state === "incompatible"
                ? "danger"
                : "neutral";

    return (
        <AuthRouteGuard>
            <ScrollView
                style={styles.scrollView}
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
                    <View style={styles.shell}>
                        <View style={styles.headerRow}>
                            <View style={styles.headerCopy}>
                                <ThemedText type="code" themeColor="accent">
                                    Firepit home
                                </ThemedText>
                                <ThemedText type="title" style={styles.title}>
                                    Welcome back, {username}.
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    This is your quick-start dashboard for the
                                    current instance. Jump into chat, browse
                                    servers, or open your account menu.
                                </ThemedText>
                            </View>
                            <ProfileMenu />
                        </View>

                        <ThemedView
                            type="card"
                            style={[
                                styles.heroCard,
                                { borderColor: theme.border },
                            ]}
                        >
                            <View style={styles.pillRow}>
                                <StatusPill label={statusLabel} tone={statusTone} />
                                <StatusPill
                                    label={
                                        compatibility?.compatible
                                            ? "compatible"
                                            : "check version"
                                    }
                                    tone={
                                        compatibility?.compatible
                                            ? "success"
                                            : "warning"
                                    }
                                />
                                <StatusPill
                                    label={version?.version ?? "no version"}
                                    tone="neutral"
                                />
                            </View>

                            <View style={styles.detailGrid}>
                                <View style={styles.detailItem}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        Instance
                                    </ThemedText>
                                    <ThemedText type="smallBold" numberOfLines={1}>
                                        {instanceUrl ?? "Not connected"}
                                    </ThemedText>
                                </View>
                                <View style={styles.detailItem}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        Username
                                    </ThemedText>
                                    <ThemedText type="smallBold" numberOfLines={1}>
                                        {username}
                                    </ThemedText>
                                </View>
                                <View style={styles.detailItem}>
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                    >
                                        Status
                                    </ThemedText>
                                    <ThemedText type="smallBold" numberOfLines={1}>
                                        {statusLabel}
                                    </ThemedText>
                                </View>
                            </View>
                        </ThemedView>

                        <View style={styles.actionsRow}>
                            <ActionButton
                                label="Open chat"
                                onPress={() => router.push("/chat")}
                            />
                            <ActionButton
                                label="Browse servers"
                                tone="secondary"
                                onPress={() => router.push("/home")}
                            />
                            {featureFlags?.enabled ? (
                                <ActionButton
                                    label="Create server"
                                    tone="ghost"
                                    onPress={() => router.push("/create-server")}
                                />
                            ) : null}
                            <ActionButton
                                label="Settings"
                                tone="ghost"
                                onPress={() => router.push("/settings")}
                            />
                        </View>

                        <ThemedView
                            type="card"
                            style={[
                                styles.panel,
                                { borderColor: theme.border },
                            ]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">
                                    Your joined servers
                                </ThemedText>
                                <ActionButton
                                    label="Refresh"
                                    tone="ghost"
                                    onPress={refresh}
                                />
                            </View>

                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Jump into a server to browse channels and read
                                the latest messages.
                            </ThemedText>

                            {loadState === "loading" ? (
                                <ThemedText themeColor="mutedForeground">
                                    Loading servers…
                                </ThemedText>
                            ) : null}

                            {loadError ? (
                                <ThemedText themeColor="destructive">
                                    {loadError}
                                </ThemedText>
                            ) : null}

                            <View style={styles.serverList}>
                                {servers.length > 0 ? (
                                    servers.map((server) => (
                                        <Pressable
                                            key={server.$id!}
                                            accessibilityRole="button"
                                            onPress={() =>
                                                router.push({
                                                    pathname:
                                                        "/server/[serverId]",
                                                    params: {
                                                        serverId: server.$id,
                                                    },
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.serverCard,
                                                {
                                                    backgroundColor:
                                                        theme.card,
                                                    borderColor: theme.border,
                                                    opacity: pressed ? 0.92 : 1,
                                                },
                                            ]}
                                        >
                                            <View style={styles.serverCardCopy}>
                                                <ThemedText type="smallBold">
                                                    {server.name ??
                                                        "Untitled server"}
                                                </ThemedText>
                                                <ThemedText
                                                    themeColor="mutedForeground"
                                                    style={styles.copy}
                                                >
                                                    {server.description ??
                                                        "Open this server to browse channels."}
                                                </ThemedText>
                                            </View>
                                            <ThemedText
                                                type="code"
                                                themeColor="accent"
                                            >
                                                Open
                                            </ThemedText>
                                        </Pressable>
                                    ))
                                ) : loadState === "ready" ? (
                                    <ThemedText themeColor="mutedForeground">
                                        No joined servers yet. Use the chat tab to
                                        inspect server membership and open a
                                        channel.
                                    </ThemedText>
                                ) : null}
                            </View>
                        </ThemedView>
                    </View>
                </SafeAreaView>
            </ScrollView>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    safeArea: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
        gap: Spacing.three,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: Spacing.three,
        paddingTop: Spacing.two,
    },
    headerCopy: {
        flex: 1,
        gap: Spacing.one,
    },
    title: {
        maxWidth: 520,
    },
    copy: {
        fontSize: 15,
        lineHeight: 22,
    },
    profileButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(15, 15, 18, 0.28)",
    },
    modalAnchor: {
        paddingTop: 72,
        paddingHorizontal: Spacing.three,
        alignItems: "flex-end",
    },
    menuCard: {
        width: "100%",
        maxWidth: 320,
        borderWidth: 1,
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        shadowColor: "#000000",
        shadowOpacity: 0.14,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
    },
    menuHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
    },
    avatarCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(217, 121, 43, 0.14)",
    },
    menuHeaderCopy: {
        flex: 1,
        gap: 2,
    },
    menuBody: {
        gap: Spacing.two,
    },
    menuActions: {
        gap: Spacing.two,
    },
    metaText: {
        fontSize: 13,
        lineHeight: 18,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    panel: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.two,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: Spacing.two,
    },
    serverList: {
        gap: Spacing.two,
    },
    serverCard: {
        borderWidth: 1,
        borderRadius: 20,
        padding: Spacing.three,
        gap: Spacing.one,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    serverCardCopy: {
        flex: 1,
        gap: 2,
        paddingRight: Spacing.two,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    pill: {
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    detailGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    detailItem: {
        flexGrow: 1,
        minWidth: 150,
        gap: 4,
        borderRadius: 18,
        padding: Spacing.three,
        backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    actionButton: {
        minWidth: 120,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    actionButtonPressed: {
        opacity: 0.85,
    },
    actionButtonLabel: {
        textAlign: "center",
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
