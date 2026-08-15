import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getServers } from "@/lib/server-cache";
import type { Server } from "@/lib/firepit/types";
import { FirepitHttpError } from "@/lib/firepit/http";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type StatusTone = "neutral" | "success" | "warning" | "danger";

function statusToneFor(state: string): StatusTone {
    if (state === "ready") return "success";
    if (state === "needs-auth") return "warning";
    if (state === "incompatible") return "danger";
    return "neutral";
}

function ActionChip({
    label,
    onPress,
    tone = "primary",
}: {
    label: string;
    onPress: () => void;
    tone?: "primary" | "secondary" | "ghost";
}) {
    const theme = useTheme();

    const toneStyles: Record<
        "primary" | "secondary" | "ghost",
        { backgroundColor: string; borderColor: string }
    > = {
        primary: { backgroundColor: theme.primary, borderColor: theme.primary },
        secondary: { backgroundColor: theme.secondary, borderColor: theme.border },
        ghost: { backgroundColor: "transparent", borderColor: "transparent" },
    };
    const labelColor: Record<"primary" | "secondary" | "ghost", "primaryForeground" | "foreground"> = {
        primary: "primaryForeground",
        secondary: "foreground",
        ghost: "foreground",
    };

    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionChip,
                toneStyles[tone],
                pressed && styles.actionChipPressed,
            ]}
        >
            <ThemedText
                type="smallBold"
                style={styles.actionChipLabel}
                themeColor={labelColor[tone]}
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

    const statusTone: StatusTone = statusToneFor(state);

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
                    {currentUser?.avatarUrl ? (
                        <Image
                            source={{ uri: currentUser.avatarUrl }}
                            style={styles.avatarImage}
                        />
                    ) : (
                        <ThemedText type="smallBold">
                            {username.slice(0, 1).toUpperCase()}
                        </ThemedText>
                    )}
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
                                {currentUser?.avatarUrl ? (
                                    <Image
                                        source={{ uri: currentUser.avatarUrl }}
                                        style={styles.avatarImage}
                                    />
                                ) : (
                                    <ThemedText type="smallBold">
                                        {username.slice(0, 1).toUpperCase()}
                                    </ThemedText>
                                )}
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
                                <ActionChip
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
            const allServers = await getServers(instanceUrl, accessToken);
            const selectableServers = allServers.filter(
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

    useRetryOnReconnect(loadState === "error", refresh);

    return { servers, loadState, loadError, refresh };
}

export default function HomeTabScreen() {
    const {
        compatibility,
        version,
        featureFlags,
    } = useFirepitBootstrap();
    const theme = useTheme();
    const { servers, loadState, loadError, refresh } = useJoinedServers();
    const { username, statusLabel, statusTone } = useProfileSummary();

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
                    <View style={styles.shell}>
                        <View style={styles.headerRow}>
                            <View style={styles.headerCopy}>
                                <ThemedText type="code" themeColor="accent">
                                    Firepit home
                                </ThemedText>
                                <ThemedText type="title" style={styles.title}>
                                    Welcome back, {username}.
                                </ThemedText>
                            </View>
                            <ProfileMenu />
                        </View>

                        <View style={styles.statusRow}>
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

                        <View style={styles.actionsRow}>
                            <ActionChip
                                label="Open chat"
                                onPress={() => router.push("/chat")}
                            />
                            {featureFlags?.enabled ? (
                                <ActionChip
                                    label="Create server"
                                    tone="ghost"
                                    onPress={() => router.push("/create-server")}
                                />
                            ) : null}
                            <ActionChip
                                label="Settings"
                                tone="ghost"
                                onPress={() => router.push("/settings")}
                            />
                        </View>

                        <View style={styles.sectionHeaderRow}>
                            <ThemedText type="smallBold">
                                Your joined servers
                            </ThemedText>
                            <ActionChip
                                label="Refresh"
                                tone="ghost"
                                onPress={refresh}
                            />
                        </View>

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
                                servers.map((server, index) => (
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
                                            styles.serverRow,
                                            index < servers.length - 1 && styles.serverRowBorder,
                                            {
                                                opacity: pressed ? 0.92 : 1,
                                            },
                                        ]}
                                    >
                                        <View style={styles.serverRowCopy}>
                                            <ThemedText type="smallBold">
                                                {server.name ??
                                                    "Untitled server"}
                                            </ThemedText>
                                            <ThemedText
                                                themeColor="mutedForeground"
                                                style={styles.serverRowDescription}
                                                numberOfLines={1}
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
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.three,
    },
    shell: {
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: Spacing.three,
        paddingTop: Spacing.three,
    },
    headerCopy: {
        flex: 1,
        gap: Spacing.half,
    },
    title: {
        maxWidth: 520,
    },
    profileButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(15, 15, 18, 0.28)",
    },
    modalAnchor: {
        paddingTop: 72,
        paddingHorizontal: Spacing.two,
        alignItems: "flex-end",
    },
    menuCard: {
        width: "100%",
        maxWidth: 320,
        borderWidth: 1,
        borderRadius: 16,
        padding: Spacing.two,
        gap: Spacing.two,
        shadowColor: "#000000",
        shadowOpacity: 0.14,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
    },
    menuHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    avatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(217, 121, 43, 0.14)",
        overflow: "hidden",
    },
    avatarImage: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    menuHeaderCopy: {
        flex: 1,
        gap: 2,
    },
    menuBody: {
        gap: Spacing.one,
    },
    menuActions: {
        gap: Spacing.one,
    },
    metaText: {
        fontSize: 13,
        lineHeight: 18,
    },
    statusRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
        paddingVertical: Spacing.one,
    },
    pill: {
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
        paddingVertical: Spacing.one,
    },
    actionChip: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 12,
        borderWidth: 1,
    },
    actionChipPressed: {
        opacity: 0.85,
    },
    actionChipLabel: {
        fontSize: 13,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: Spacing.two,
        paddingTop: Spacing.four,
    },
    serverList: {
        gap: 0,
    },
    serverRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.two,
        gap: Spacing.two,
    },
    serverRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(255, 255, 255, 0.06)",
    },
    serverRowCopy: {
        flex: 1,
        gap: 2,
    },
    serverRowDescription: {
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
