import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
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
import {
    createDirectMessageConversation,
    fetchUserProfile,
    type UserProfile,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    userId?: string;
};

function normalizeParam(
    value?: string | string[] | null,
): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value ?? undefined;
}

function safeText(value: unknown) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function profileDisplayName(profile: UserProfile | null, userId: string) {
    return (
        safeText(profile?.displayName) ??
        safeText(profile?.name) ??
        safeText(profile?.username) ??
        safeText(profile?.handle) ??
        userId
    );
}

function profileSubtitle(profile: UserProfile | null) {
    const statusText =
        typeof profile?.status === "string"
            ? profile.status
            : profile?.status?.status ?? profile?.status?.customMessage ?? null;

    const pronouns = safeText(profile?.pronouns);
    const status = safeText(statusText);
    const bio = safeText(profile?.bio);

    return pronouns ?? status ?? bio ?? "";
}

export default function UserProfileScreen() {
    const theme = useTheme();
    const { userId } = useLocalSearchParams<RouteParams>();
    const normalizedUserId = normalizeParam(userId);
    const { instanceUrl, accessToken, currentUser, state } = useFirepitBootstrap();
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [startingDm, setStartingDm] = useState<LoadState>("idle");
    const [actionError, setActionError] = useState<string | null>(null);

    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);
    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const canStartDm = Boolean(
        signedIn && normalizedUserId && currentUserId && normalizedUserId !== currentUserId,
    );
    const avatarUrl = profile?.avatarUrl ?? profile?.avatar ?? profile?.profileImageUrl ?? null;
    const name = profileDisplayName(profile, normalizedUserId ?? "profile");
    const subtitle = profileSubtitle(profile);

    useEffect(() => {
        const baseUrl = instanceUrl ?? "";
        const token = accessToken ?? "";
        const userId = normalizedUserId ?? "";
        if (baseUrl.length === 0 || token.length === 0 || userId.length === 0) {
            setProfile(null);
            setLoadState("idle");
            return;
        }

        let cancelled = false;

        async function loadProfile() {
            setLoadState("loading");
            setError(null);
            try {
                const nextProfile = await fetchUserProfile(
                    baseUrl,
                    token,
                    userId || "",
                );
                if (!cancelled) {
                    setProfile(nextProfile ?? null);
                    setLoadState("ready");
                }
            } catch (loadError) {
                if (!cancelled) {
                    setProfile(null);
                    setLoadState("error");
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "Unable to load profile",
                    );
                }
            }
        }

        void loadProfile();

        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceUrl, normalizedUserId]);

    const profileFields = useMemo(
        () => [
            { label: "Pronouns", value: safeText(profile?.pronouns) },
            { label: "Location", value: safeText(profile?.location) },
            { label: "Website", value: safeText(profile?.website) },
            {
                label: "Status",
                value: safeText(profile?.status?.status ?? profile?.status?.customMessage),
            },
            { label: "Bio", value: safeText(profile?.bio) },
        ].filter((item) => item.value),
        [profile],
    );

    const startDm = async () => {
        if (!instanceUrl || !accessToken || !normalizedUserId || !currentUserId) {
            return;
        }

        setStartingDm("loading");
        setActionError(null);
        try {
            const response = await createDirectMessageConversation(
                instanceUrl,
                accessToken,
                {
                    userId1: currentUserId,
                    userId2: normalizedUserId,
                },
            );
            const conversationId = response.conversation?.$id;
            setStartingDm("ready");
            if (conversationId) {
                router.push(`/dm/${conversationId}` as never);
            }
        } catch (startError) {
            setStartingDm("error");
            setActionError(
                startError instanceof Error
                    ? startError.message
                    : "Unable to start conversation",
            );
        }
    };

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                    >
                        <ThemedView style={styles.shell}>
                            <ThemedView
                                type="card"
                                style={[styles.heroCard, { borderColor: theme.border }]}
                            >
                                <View style={styles.heroRow}>
                                    <View style={styles.avatarShell}>
                                        {avatarUrl ? (
                                            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                                        ) : (
                                            <ThemedText type="title">{name.slice(0, 1).toUpperCase()}</ThemedText>
                                        )}
                                    </View>
                                    <View style={styles.heroCopy}>
                                        <ThemedText type="code" themeColor="accent">
                                            Profile
                                        </ThemedText>
                                        <ThemedText type="title">{name}</ThemedText>
                                        {subtitle ? (
                                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                                {subtitle}
                                            </ThemedText>
                                        ) : null}
                                        <ThemedText type="code" themeColor="mutedForeground">
                                            {normalizedUserId}
                                        </ThemedText>
                                    </View>
                                </View>
                            </ThemedView>

                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <View style={styles.sectionHeaderRow}>
                                    <ThemedText type="smallBold">Actions</ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => router.back()}
                                        style={({ pressed }) => [
                                            styles.inlineButton,
                                            {
                                                backgroundColor: theme.muted,
                                                borderColor: theme.border,
                                                opacity: pressed ? 0.88 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText type="smallBold" themeColor="foreground">
                                            Back
                                        </ThemedText>
                                    </Pressable>
                                </View>
                                {error ? <ThemedText themeColor="destructive">{error}</ThemedText> : null}
                                {actionError ? (
                                    <ThemedText themeColor="destructive">{actionError}</ThemedText>
                                ) : null}
                                {loadState === "loading" ? (
                                    <View style={styles.loadingRow}>
                                        <ActivityIndicator color={theme.primary} />
                                        <ThemedText themeColor="mutedForeground">
                                            Loading profile…
                                        </ThemedText>
                                    </View>
                                ) : null}
                                {canStartDm ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={startingDm === "loading"}
                                        onPress={() => void startDm()}
                                        style={({ pressed }) => [
                                            styles.primaryButton,
                                            {
                                                backgroundColor: theme.primary,
                                                opacity:
                                                    startingDm === "loading"
                                                        ? 0.55
                                                        : pressed
                                                          ? 0.88
                                                          : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText type="smallBold" themeColor="primaryForeground">
                                            {startingDm === "loading"
                                                ? "Starting DM…"
                                                : "Start DM"}
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                            </ThemedView>

                            {profileFields.length ? (
                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <ThemedText type="smallBold">Profile details</ThemedText>
                                    <View style={styles.fieldList}>
                                        {profileFields.map((field) => (
                                            <View key={field.label} style={styles.fieldRow}>
                                                <ThemedText type="code" themeColor="mutedForeground">
                                                    {field.label}
                                                </ThemedText>
                                                <ThemedText>{field.value}</ThemedText>
                                            </View>
                                        ))}
                                    </View>
                                </ThemedView>
                            ) : null}
                        </ThemedView>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
    },
    content: {
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    heroCard: {
        borderWidth: 1,
        borderRadius: 24,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    card: {
        borderWidth: 1,
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    heroRow: {
        flexDirection: "row",
        gap: Spacing.three,
        alignItems: "center",
    },
    heroCopy: {
        flex: 1,
        gap: Spacing.one,
    },
    avatarShell: {
        width: 72,
        height: 72,
        borderRadius: 36,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(217, 121, 43, 0.14)",
    },
    avatar: {
        width: "100%",
        height: "100%",
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    inlineButton: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    primaryButton: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    fieldList: {
        gap: Spacing.two,
    },
    fieldRow: {
        gap: 4,
    },
});
