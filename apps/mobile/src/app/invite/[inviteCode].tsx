import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionButton } from "@/components/action-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchInvitePreview, joinInvite } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function InviteScreen() {
    const { inviteCode } = useLocalSearchParams<{ inviteCode?: string }>();
    const { state, instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const theme = useTheme();
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [invite, setInvite] = useState<{
        code: string;
        serverId: string;
        channelId?: string | null;
        expiresAt?: string | null;
        maxUses?: number | null;
        currentUses?: number;
        temporary?: boolean;
    } | null>(null);
    const [serverName, setServerName] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);

    const normalizedInviteCode = Array.isArray(inviteCode)
        ? inviteCode.at(0)
        : inviteCode;
    const signedIn = state === "ready" && Boolean(accessToken && currentUser);

    const loadTokenRef = useRef(0);

    const loadInvite = useCallback(async () => {
        if (!instanceUrl || !normalizedInviteCode) {
            return;
        }

        const token = ++loadTokenRef.current;
        setLoadState("loading");
        setError(null);

        try {
            const response = await fetchInvitePreview(instanceUrl, normalizedInviteCode);
            if (loadTokenRef.current !== token) return;
            setInvite(response.invite ?? null);
            setServerName(response.server?.name ?? null);
            setLoadState("ready");
        } catch (inviteError) {
            if (loadTokenRef.current !== token) return;
            setInvite(null);
            setServerName(null);
            setLoadState("error");
            setError(
                inviteError instanceof Error
                    ? inviteError.message
                    : "Unable to load invite",
            );
        }
    }, [instanceUrl, normalizedInviteCode]);

    useEffect(() => {
        void loadInvite();
    }, [loadInvite]);

    useRetryOnReconnect(loadState === "error", loadInvite);

    const serverId = invite?.serverId ?? null;
    const handleJoin = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedInviteCode) {
            setError("Sign in first to redeem this invite.");
            return;
        }

        try {
            setJoining(true);
            setError(null);
            const response = await joinInvite(instanceUrl, accessToken, normalizedInviteCode);
            const nextServerId = response.serverId ?? serverId;
            if (!nextServerId) {
                throw new Error("Invite was redeemed, but no server id was returned.");
            }
            router.replace(`/server/${nextServerId}`);
        } catch (joinError) {
            setError(
                joinError instanceof Error
                    ? joinError.message
                    : "Unable to join via invite",
            );
        } finally {
            setJoining(false);
        }
    }, [accessToken, instanceUrl, serverId, normalizedInviteCode]);

    return (
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
                    <ThemedView type="card" style={[styles.heroCard, { borderColor: theme.border }]}>
                        <ThemedText type="code" themeColor="accent">
                            Invite redemption
                        </ThemedText>
                        <ThemedText type="title" style={styles.title}>
                            Join a server from an invite link.
                        </ThemedText>
                        <ThemedText themeColor="mutedForeground" style={styles.copy}>
                            This screen previews the invite first so you can see
                            which server you are about to join, then confirms the
                            join with your current session.
                        </ThemedText>
                    </ThemedView>

                    <ThemedView type="card" style={[styles.panel, { borderColor: theme.border }]}>
                        {!normalizedInviteCode ? (
                            <View style={styles.stateStack}>
                                <ThemedText type="smallBold">Missing invite code.</ThemedText>
                                <ThemedText themeColor="mutedForeground">
                                    Open this screen with an invite code in the
                                    route path.
                                </ThemedText>
                            </View>
                        ) : loadState === "loading" ? (
                            <View style={styles.stateStack}>
                                <ThemedText type="smallBold">Loading invite…</ThemedText>
                                <ThemedText themeColor="mutedForeground">
                                    Checking the invite target and expiry.
                                </ThemedText>
                            </View>
                        ) : loadState === "error" ? (
                            <View style={styles.stateStack}>
                                <ThemedText type="smallBold">Invite not found.</ThemedText>
                                <ThemedText themeColor="mutedForeground">
                                    The invite preview could not be loaded.
                                </ThemedText>
                                {error ? (
                                    <ThemedText themeColor="danger" style={styles.metaText}>
                                        {error}
                                    </ThemedText>
                                ) : null}
                                <ActionButton
                                    label="Try again"
                                    tone="secondary"
                                    onPress={() => {
                                        void loadInvite();
                                    }}
                                />
                            </View>
                        ) : (
                            <View style={styles.form}>
                                <View style={styles.detailBlock}>
                                    <ThemedText type="smallBold">
                                        {serverName ?? "Invite server"}
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground">
                                        Invite code: {normalizedInviteCode}
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground">
                                        {invite?.temporary ? "Temporary invite" : "Standard invite"}
                                        {invite?.expiresAt ? ` · Expires ${invite.expiresAt}` : ""}
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground">
                                        {typeof invite?.currentUses === "number"
                                            ? `${invite.currentUses}${typeof invite?.maxUses === "number" ? ` / ${invite.maxUses}` : ""} uses`
                                            : "Usage details unavailable"}
                                    </ThemedText>
                                </View>

                                {!signedIn ? (
                                    <View style={styles.stateStack}>
                                        <ThemedText type="smallBold">
                                            Sign in to redeem.
                                        </ThemedText>
                                        <ThemedText themeColor="mutedForeground">
                                            You need an active session before the
                                            invite can be joined.
                                        </ThemedText>
                                        <ActionButton
                                            label="Go to login"
                                            tone="secondary"
                                            onPress={() => router.replace("/login")}
                                        />
                                    </View>
                                ) : (
                                    <ActionButton
                                        label={joining ? "Joining…" : "Join server"}
                                        disabled={joining}
                                        onPress={() => {
                                            void handleJoin();
                                        }}
                                    />
                                )}

                                <ActionButton
                                    label="Back to home"
                                    tone="ghost"
                                    onPress={() => router.replace("/home")}
                                />

                                {error ? (
                                    <ThemedText themeColor="danger" style={styles.metaText}>
                                        {error}
                                    </ThemedText>
                                ) : null}
                            </View>
                        )}
                    </ThemedView>
                </View>
            </SafeAreaView>
        </ScrollView>
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
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
        paddingTop: Spacing.three,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    title: {
        maxWidth: 520,
    },
    copy: {
        fontSize: 15,
        lineHeight: 22,
    },
    panel: {
        borderRadius: 24,
        borderWidth: 1,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    form: {
        gap: Spacing.three,
    },
    stateStack: {
        gap: Spacing.one,
    },
    detailBlock: {
        gap: Spacing.one,
    },
    metaText: {
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
