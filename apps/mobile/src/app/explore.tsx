import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
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
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Server, ServerPreview } from "@/lib/firepit";
import { fetchMyServers, fetchPublicServers, joinServer } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

function ActionButton({
    label,
    onPress,
    disabled,
    tone = "primary",
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: "primary" | "secondary" | "ghost";
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
                        tone === "primary"
                            ? theme.primary
                            : tone === "secondary"
                              ? theme.secondary
                              : theme.muted,
                    borderColor:
                        tone === "primary" ? theme.primary : theme.border,
                },
                pressed && !disabled && styles.actionButtonPressed,
                disabled && styles.actionButtonDisabled,
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

export default function SessionScreen() {
    const {
        state,
        instanceUrl,
        currentUser,
        compatibility,
        authenticate,
        signOut,
        resetConnection,
        version,
        accessToken,
    } = useFirepitBootstrap();
    const theme = useTheme();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState<string | null>(null);
    const [serverLoadState, setServerLoadState] = useState<LoadState>("idle");
    const [serverError, setServerError] = useState<string | null>(null);
    const [myServers, setMyServers] = useState<Server[]>([]);
    const [publicServers, setPublicServers] = useState<ServerPreview[]>([]);
    const [joiningServerId, setJoiningServerId] = useState<string | null>(null);

    const signedIn = Boolean(currentUser && accessToken && state === "ready");

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

    const joinedServerIds = useMemo(() => {
        const nextJoinedServerIds = new Set<string>();

        for (const server of myServers) {
            if (server.$id) {
                nextJoinedServerIds.add(server.$id);
            }
        }

        return nextJoinedServerIds;
    }, [myServers]);

    const discoverablePublicServers = useMemo(
        () =>
            publicServers.filter(
                (server) => !server.$id || !joinedServerIds.has(server.$id),
            ),
        [joinedServerIds, publicServers],
    );

    const loadServers = useCallback(async () => {
        if (!instanceUrl) {
            return;
        }

        setServerLoadState("loading");
        setServerError(null);

        try {
            const [nextPublicServers, nextMyServers] = await Promise.all([
                fetchPublicServers(instanceUrl),
                signedIn && accessToken
                    ? fetchMyServers(instanceUrl, accessToken)
                    : Promise.resolve({ servers: [] as Server[] }),
            ]);

            setPublicServers(nextPublicServers.servers ?? []);
            setMyServers(nextMyServers.servers ?? []);
            setServerLoadState("ready");
        } catch (loadError) {
            setServerLoadState("error");
            setServerError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load servers",
            );
        }
    }, [accessToken, instanceUrl, signedIn]);

    useEffect(() => {
        void loadServers();
    }, [loadServers]);

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
                                Firepit server browser
                            </ThemedText>
                            <ThemedText type="subtitle">
                                Open an instance, then pick a server.
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Firepit-style warm neutrals and compact cards
                                keep the browser aligned with the web app.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={shellStatus}
                                    tone={
                                        state === "ready"
                                            ? "success"
                                            : state === "incompatible"
                                              ? "danger"
                                              : "warning"
                                    }
                                />
                                <StatusPill
                                    label={
                                        signedIn ? "signed in" : "signed out"
                                    }
                                    tone={signedIn ? "success" : "warning"}
                                />
                                <StatusPill
                                    label={version?.version ?? "no version"}
                                    tone="neutral"
                                />
                            </View>
                        </ThemedView>

                        {!signedIn ? (
                            <ThemedView
                                type="card"
                                style={[
                                    styles.card,
                                    { borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="smallBold">
                                    Sign in
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    Use your Firepit account email and password.
                                </ThemedText>
                                <TextInput
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="email"
                                    keyboardType="email-address"
                                    placeholder="Email address"
                                    placeholderTextColor={theme.mutedForeground}
                                    textContentType="emailAddress"
                                    value={email}
                                    onChangeText={setEmail}
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
                                    autoComplete="password"
                                    placeholder="Password"
                                    placeholderTextColor={theme.mutedForeground}
                                    secureTextEntry
                                    textContentType="password"
                                    value={password}
                                    onChangeText={setPassword}
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: theme.card,
                                            borderColor: theme.input,
                                            color: theme.foreground,
                                        },
                                    ]}
                                />
                                <ActionButton
                                    label={
                                        state === "loading"
                                            ? "Signing in…"
                                            : "Sign in"
                                    }
                                    disabled={state === "loading"}
                                    onPress={async () => {
                                        try {
                                            setAuthError(null);
                                            await authenticate(
                                                email?.trim?.() ?? "",
                                                password ?? "",
                                            );
                                        } catch (signInError) {
                                            setAuthError(
                                                signInError instanceof Error
                                                    ? signInError.message
                                                    : "Unable to authenticate",
                                            );
                                        }
                                    }}
                                />
                                {authError ? (
                                    <ThemedText themeColor="destructive">
                                        {authError}
                                    </ThemedText>
                                ) : null}
                            </ThemedView>
                        ) : null}

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <ThemedText type="smallBold">
                                    Your servers
                                </ThemedText>
                                <View style={styles.headerActions}>
                                    <ActionButton
                                        label="Reset cache"
                                        tone="ghost"
                                        onPress={async () => {
                                            await resetConnection();
                                            router.replace("/");
                                        }}
                                    />
                                    <ActionButton
                                        label="Sign out"
                                        tone="ghost"
                                        onPress={async () => {
                                            await signOut();
                                            router.replace("/login");
                                        }}
                                    />
                                </View>
                            </View>

                            {serverLoadState === "loading" ? (
                                <ThemedText themeColor="mutedForeground">
                                    Loading server lists…
                                </ThemedText>
                            ) : null}
                            {serverError ? (
                                <ThemedText themeColor="destructive">
                                    {serverError}
                                </ThemedText>
                            ) : null}

                            {signedIn ? (
                                myServers.length > 0 ? (
                                    <View style={styles.list}>
                                        {myServers.map((server) => (
                                            <ServerCard
                                                key={server.$id ?? server.name}
                                                server={server}
                                                accent="primary"
                                                onOpen={() => {
                                                    if (!server.$id) {
                                                        return;
                                                    }
                                                    router.push(
                                                        `/server/${server.$id}`,
                                                    );
                                                }}
                                            />
                                        ))}
                                    </View>
                                ) : (
                                    <ThemedText themeColor="mutedForeground">
                                        You have not joined any servers on this
                                        instance yet.
                                    </ThemedText>
                                )
                            ) : (
                                <ThemedText themeColor="mutedForeground">
                                    Sign in to load your personal server list.
                                </ThemedText>
                            )}
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">
                                Public discovery
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Join a public server directly or open it to
                                inspect the workspace shell.
                            </ThemedText>
                            <View style={styles.list}>
                                {discoverablePublicServers.length > 0 ? (
                                    discoverablePublicServers.map((server) => (
                                        <ServerCard
                                            key={server.$id ?? server.name}
                                            server={server}
                                            accent="secondary"
                                            onOpen={() => {
                                                if (!server.$id) {
                                                    return;
                                                }
                                                router.push(
                                                    `/server/${server.$id}`,
                                                );
                                            }}
                                            onJoin={
                                                signedIn &&
                                                instanceUrl &&
                                                accessToken &&
                                                server.$id
                                                    ? async () => {
                                                          try {
                                                              setJoiningServerId(
                                                                  server.$id ??
                                                                      null,
                                                              );
                                                              await joinServer(
                                                                  instanceUrl,
                                                                  accessToken,
                                                                  server.$id ??
                                                                      "",
                                                              );
                                                              await loadServers();
                                                              router.push(
                                                                  `/server/${server.$id}`,
                                                              );
                                                          } catch (joinError) {
                                                              setServerError(
                                                                  joinError instanceof
                                                                      Error
                                                                      ? joinError.message
                                                                      : "Unable to join server",
                                                              );
                                                          } finally {
                                                              setJoiningServerId(
                                                                  null,
                                                              );
                                                          }
                                                      }
                                                    : undefined
                                            }
                                            joinLabel={
                                                joiningServerId === server.$id
                                                    ? "Joining…"
                                                    : "Join"
                                            }
                                        />
                                    ))
                                ) : (
                                    <ThemedText themeColor="mutedForeground">
                                        No public servers are available right
                                        now.
                                    </ThemedText>
                                )}
                            </View>
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Next slice</ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                The workspace shell is intentionally narrow so
                                the future channel and message timeline can slot
                                in without a redesign.
                            </ThemedText>
                        </ThemedView>
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
        </AuthRouteGuard>
    );
}

function ServerCard({
    server,
    accent,
    onOpen,
    onJoin,
    joinLabel = "Open",
}: {
    server: Server | ServerPreview;
    accent: "primary" | "secondary";
    onOpen: () => void;
    onJoin?: () => void;
    joinLabel?: string;
}) {
    const theme = useTheme();

    return (
        <ThemedView
            type="card"
            style={[styles.serverCard, { borderColor: theme.border }]}
        >
            <View style={styles.serverCardHeader}>
                <View style={styles.serverTextBlock}>
                    <ThemedText type="smallBold">
                        {server.name ?? "Unnamed server"}
                    </ThemedText>
                    <ThemedText
                        themeColor="mutedForeground"
                        style={styles.serverMeta}
                    >
                        {server.description ?? "No description"}
                    </ThemedText>
                </View>
                <StatusPill
                    label={server.isPublic ? "public" : "private"}
                    tone={server.isPublic ? "success" : "warning"}
                />
            </View>

            <View style={styles.serverMetaRow}>
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.serverMeta}
                >
                    {server.memberCount ?? 0} members
                </ThemedText>
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.serverMeta}
                >
                    {server.defaultOnSignup ? "default signup" : "not default"}
                </ThemedText>
            </View>

            <View style={styles.cardActions}>
                <ActionButton
                    label="Open"
                    tone={accent === "primary" ? "primary" : "secondary"}
                    onPress={onOpen}
                />
                {onJoin ? (
                    <ActionButton
                        label={joinLabel}
                        tone="ghost"
                        onPress={onJoin}
                    />
                ) : null}
            </View>
        </ThemedView>
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
    input: {
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 16,
    },
    actionButton: {
        minHeight: 44,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.four,
        borderWidth: 1,
        shadowColor: "#d9792b",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
    },
    actionButtonPressed: {
        opacity: 0.85,
    },
    actionButtonDisabled: {
        opacity: 0.5,
    },
    actionButtonLabel: {
        fontSize: 14,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    statusPill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: 6,
        borderRadius: 999,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
    },
    list: {
        gap: Spacing.two,
    },
    serverCard: {
        borderRadius: 18,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    serverCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    serverTextBlock: {
        flex: 1,
        gap: 2,
    },
    serverMeta: {
        fontSize: 13,
        lineHeight: 18,
    },
    serverMetaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    cardActions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
});
