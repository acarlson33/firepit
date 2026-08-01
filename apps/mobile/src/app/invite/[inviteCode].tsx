import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchInvitePreview, joinInvite } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { ArrowLeft } from "lucide-react-native";

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
    const [joinedServerId, setJoinedServerId] = useState<string | null>(null);

    const normalizedInviteCode = Array.isArray(inviteCode) ? inviteCode[0] : inviteCode;
    const signedIn = state === "ready" && Boolean(accessToken && currentUser);

    const pageStatus = useMemo(() => {
        if (!normalizedInviteCode) {
            return "missing code";
        }
        if (loadState === "loading") {
            return "loading invite";
        }
        if (loadState === "error") {
            return "invite error";
        }
        if (joinedServerId) {
            return "joined";
        }
        return signedIn ? "ready" : "needs login";
    }, [joinedServerId, loadState, normalizedInviteCode, signedIn]);

    const loadInvite = useCallback(async () => {
        if (!instanceUrl || !normalizedInviteCode) {
            return;
        }

        setLoadState("loading");
        setError(null);

        try {
            const response = await fetchInvitePreview(instanceUrl, normalizedInviteCode);
            setInvite(response.invite ?? null);
            setServerName(response.server?.name ?? null);
            setLoadState("ready");
        } catch (inviteError) {
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
            setJoinedServerId(nextServerId);
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

                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                    style={styles.metaText}
                                >
                                    Status: {pageStatus}
                                </ThemedText>
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
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
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
