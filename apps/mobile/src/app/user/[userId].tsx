import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createDirectMessageConversation,
    type UserProfile,
} from "@/lib/firepit";
import { getCachedUserProfile } from "@/lib/profile-cache";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { RelationshipActions } from "@/components/relationship-actions";
import { ReportUserModal } from "@/components/report-user-modal";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    userId?: string;
};

type ParsedGradient = {
    colors: string[];
    start: { x: number; y: number };
    end: { x: number; y: number };
};

function parseCssGradient(cssValue: string): ParsedGradient | null {
    const match = cssValue.match(/linear-gradient\((.+)\)/);
    if (!match) return null;
    const args = match[1];

    const angleMatch = args.match(/^(\d+)deg,\s*/);
    let angleDeg = 180;
    let colorsStr = args;
    if (angleMatch) {
        angleDeg = parseInt(angleMatch[1], 10);
        colorsStr = args.slice(angleMatch[0].length);
    }

    const hexColorPattern = /#[0-9a-fA-F]{3,8}/g;
    const colors = colorsStr.match(hexColorPattern);
    if (!colors || colors.length < 2) return null;

    const rad = (angleDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);

    const start = {
        x: dx < 0 ? 1 : 0,
        y: dy < 0 ? 1 : 0,
    };
    const end = {
        x: dx > 0 ? 1 : 0,
        y: dy > 0 ? 1 : 0,
    };

    return { colors, start, end };
}

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

function statusColor(
    status?: string,
): { color: string; label: string } | null {
    if (!status) return null;
    const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
    if (normalized === "online") return { color: "#22c55e", label: "Online" };
    if (normalized === "away" || normalized === "idle") return { color: "#f59e0b", label: "Away" };
    if (normalized === "dnd" || normalized === "donotdisturb") return { color: "#ef4444", label: "Do Not Disturb" };
    return { color: "#6b7280", label: "Offline" };
}

const PRESET_FRAME_EMOJI: Record<string, string> = {
    star: "⭐",
    diamond: "💎",
    square: "⬜",
    round: "⚪",
    spring: "🌸",
    summer: "☀️",
    fall: "🍂",
    winter: "❄️",
};

function frameEmojiForPreset(preset?: string): string | null {
    if (!preset) return null;
    const lower = preset.toLowerCase();
    for (const [key, emoji] of Object.entries(PRESET_FRAME_EMOJI)) {
        if (lower.includes(key)) return emoji;
    }
    return "✨";
}

function AvatarWithFrame({
    avatarUrl,
    frameUrl,
    framePreset,
    name,
    size = 72,
}: {
    avatarUrl?: string | null;
    frameUrl?: string | null;
    framePreset?: string | null;
    name: string;
    size?: number;
}) {
    const theme = useTheme();
    const frameInset = frameUrl ? 14 : 0;
    const innerSize = size - (frameInset * 2);
    const frameEmoji = frameEmojiForPreset(framePreset ?? undefined);
    const showFrameEmoji = Boolean(!frameUrl && frameEmoji);

    return (
        <View style={{ width: size, height: size, position: "relative" }}>
            {frameUrl ? (
                <Image
                    source={{ uri: frameUrl }}
                    style={[
                        StyleSheet.absoluteFill,
                        { zIndex: 1 },
                    ]}
                    pointerEvents="none"
                    contentFit="contain"
                />
            ) : null}
            <View
                style={{
                    position: "absolute",
                    left: frameInset,
                    top: frameInset,
                    width: innerSize,
                    height: innerSize,
                    borderRadius: innerSize / 2,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(217, 121, 43, 0.14)",
                    zIndex: 2,
                    borderWidth: showFrameEmoji ? 3 : 0,
                    borderColor: frameUrl ? undefined : theme.accent,
                    borderStyle: "solid",
                }}
            >
                {avatarUrl ? (
                    <Image
                        source={{ uri: avatarUrl }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                    />
                ) : (
                    <ThemedText type="title" style={{ fontSize: size * 0.35 }}>
                        {name.slice(0, 1).toUpperCase()}
                    </ThemedText>
                )}
            </View>
            {showFrameEmoji ? (
                <View
                    style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: theme.background,
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 3,
                    }}
                >
                    <ThemedText style={{ fontSize: 12 }}>
                        {frameEmoji}
                    </ThemedText>
                </View>
            ) : null}
        </View>
    );
}

function StatusDot({ status }: { status?: string }) {
    const info = statusColor(status);
    if (!info) return null;
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: info.color,
                }}
            />
            <ThemedText themeColor="mutedForeground" type="code">
                {info.label}
            </ThemedText>
        </View>
    );
}

type ProfileBackground =
    | { type: "image" }
    | { type: "gradient"; parsed: ParsedGradient }
    | { type: "color"; color: string }
    | null;

function getProfileBackground(
    profile: UserProfile | null,
): ProfileBackground {
    if (profile?.profileBackgroundUrl) {
        return { type: "image" };
    }
    if (profile?.profileBackgroundGradient) {
        const parsed = parseCssGradient(profile.profileBackgroundGradient);
        if (parsed) {
            return { type: "gradient", parsed };
        }
        return null;
    }
    if (profile?.profileBackgroundColor) {
        return { type: "color", color: profile.profileBackgroundColor };
    }
    return null;
}

export default function UserProfileScreen() {
    const theme = useTheme();
    const { userId } = useLocalSearchParams<RouteParams>();
    const normalizedUserId = normalizeParam(userId);
    const { instanceUrl, accessToken, currentUser, state } = useFirepitBootstrap();
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [startingDm, setStartingDm] = useState<LoadState>("idle");
    const [actionError, setActionError] = useState<string | null>(null);
    const [reportVisible, setReportVisible] = useState(false);

    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);
    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const isOwnProfile = Boolean(currentUserId && normalizedUserId && currentUserId === normalizedUserId);
    const canStartDm = Boolean(
        signedIn && normalizedUserId && currentUserId && normalizedUserId !== currentUserId,
    );
    const avatarUrl = profile?.avatarUrl ?? profile?.avatar ?? profile?.profileImageUrl ?? null;
    const frameUrl = profile?.avatarFrameUrl ?? null;
    const framePreset = profile?.avatarFramePreset ?? null;
    const name = profileDisplayName(profile, normalizedUserId ?? "profile");
    const subtitle = profileSubtitle(profile);
    const statusValue = typeof profile?.status === "string" ? profile.status : profile?.status?.status ?? undefined;
    const profileBackground = getProfileBackground(profile);
    const hasBackground = profileBackground !== null;

    useEffect(() => {
        const baseUrl = instanceUrl ?? "";
        const token = accessToken ?? "";
        const id = normalizedUserId ?? "";
        if (baseUrl.length === 0 || token.length === 0 || id.length === 0) {
            setProfile(null);
            setLoadState("idle");
            return;
        }

        let cancelled = false;

        async function loadProfile() {
            setLoadState("loading");
            setError(null);
            try {
                const nextProfile = await getCachedUserProfile(
                    baseUrl,
                    token,
                    id,
                );
                if (!cancelled) {
                    setProfile(nextProfile as UserProfile | null);
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
    }, [accessToken, instanceUrl, normalizedUserId, reloadNonce]);

    useRetryOnReconnect(loadState === "error", () => setReloadNonce((n) => n + 1));

    const profileFields = useMemo(
        () => [
            { label: "Pronouns", value: safeText(profile?.pronouns) },
            { label: "Location", value: safeText(profile?.location) },
            { label: "Website", value: safeText(profile?.website), isLink: true },
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
                        {loadState === "loading" ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color={theme.primary} size="large" />
                                <ThemedText themeColor="mutedForeground" style={{ marginTop: Spacing.two }}>
                                    Loading profile…
                                </ThemedText>
                            </View>
                        ) : (
                            <ThemedView style={styles.shell}>
                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.heroCard,
                                    {
                                        borderColor: theme.border,
                                        ...(hasBackground
                                            ? { backgroundColor: undefined }
                                            : {}),
                                    },
                                ]}
                            >
                                {profileBackground?.type === "image" ? (
                                    <View style={StyleSheet.absoluteFill}>
                                        <Image
                                            source={{
                                                uri: profile?.profileBackgroundUrl,
                                            }}
                                            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
                                            contentFit="cover"
                                        />
                                    </View>
                                ) : null}
                                {profileBackground?.type === "gradient" ? (
                                    <LinearGradient
                                        colors={profileBackground.parsed.colors as [string, string, ...string[]]}
                                        start={profileBackground.parsed.start}
                                        end={profileBackground.parsed.end}
                                        style={StyleSheet.absoluteFill}
                                    />
                                ) : null}
                                {profileBackground?.type === "color" && profileBackground.color ? (
                                    <View
                                        style={[
                                            StyleSheet.absoluteFill,
                                            { backgroundColor: profileBackground.color },
                                        ]}
                                    />
                                ) : null}
                                <View
                                    style={[
                                        styles.heroContentOverlay,
                                        hasBackground ? styles.heroOverlay : null,
                                    ]}
                                >
                                    <View style={styles.heroRow}>
                                        <AvatarWithFrame
                                            avatarUrl={avatarUrl}
                                            frameUrl={frameUrl}
                                            framePreset={framePreset}
                                            name={name}
                                            size={80}
                                        />
                                        <View style={styles.heroCopy}>
                                            <ThemedText type="code" themeColor="accent">
                                                Profile
                                            </ThemedText>
                                            <ThemedText type="title">
                                                {name}
                                            </ThemedText>
                                            {subtitle || statusValue ? (
                                                <View style={{ gap: 2 }}>
                                                    {statusValue ? (
                                                        <StatusDot status={statusValue} />
                                                    ) : null}
                                                    {subtitle && subtitle !== statusValue ? (
                                                        <ThemedText
                                                            themeColor="mutedForeground"
                                                            style={styles.copy}
                                                        >
                                                            {subtitle}
                                                        </ThemedText>
                                                    ) : null}
                                                </View>
                                            ) : null}
                                            <ThemedText type="code" themeColor="mutedForeground">
                                                {normalizedUserId}
                                            </ThemedText>
                                        </View>
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

                                {error ? (
                                    <ThemedText themeColor="destructive">{error}</ThemedText>
                                ) : null}
                                {actionError ? (
                                    <ThemedText themeColor="destructive">{actionError}</ThemedText>
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

                                {normalizedUserId && !isOwnProfile ? (
                                    <>
                                        <View style={styles.divider} />
                                        <RelationshipActions
                                            targetUserId={normalizedUserId}
                                        />
                                    </>
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
                                                {"isLink" in field && field.isLink ? (
                                                    <Pressable
                                                        accessibilityRole="link"
                                                        onPress={() => {
                                                            const url = field.value;
                                                            if (!url) return;
                                                            const link = /^https?:\/\//i.test(url)
                                                                ? url
                                                                : `https://${url}`;
                                                            Linking.openURL(link).catch(
                                                                () => undefined,
                                                            );
                                                        }}
                                                    >
                                                        <ThemedText themeColor="foreground" style={styles.linkText}>
                                                            {field.value}
                                                        </ThemedText>
                                                    </Pressable>
                                                ) : (
                                                    <ThemedText style={field.label === "Bio" ? styles.bioText : undefined}>
                                                        {field.value}
                                                    </ThemedText>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                </ThemedView>
                            ) : null}

                            {normalizedUserId && !isOwnProfile ? (
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => setReportVisible(true)}
                                    style={({ pressed }) => ({
                                        alignSelf: "center",
                                        opacity: pressed ? 0.7 : 1,
                                        paddingVertical: Spacing.two,
                                    })}
                                >
                                    <ThemedText
                                        type="code"
                                        themeColor="mutedForeground"
                                        style={styles.reportText}
                                    >
                                        Report User
                                    </ThemedText>
                                </Pressable>
                            ) : null}

                            {normalizedUserId ? (
                                <ReportUserModal
                                    visible={reportVisible}
                                    onClose={() => setReportVisible(false)}
                                    targetUserId={normalizedUserId}
                                    targetDisplayName={name}
                                />
                            ) : null}
                        </ThemedView>
                        )}
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
        overflow: "hidden",
    },
    heroContentOverlay: {
        padding: Spacing.three,
        gap: Spacing.two,
    },
    heroOverlay: {
        backgroundColor: "rgba(0,0,0,0.45)",
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
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: Spacing.six,
    },
    primaryButton: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    divider: {
        height: 1,
        backgroundColor: "rgba(128,128,128,0.2)",
    },
    fieldList: {
        gap: Spacing.two,
    },
    fieldRow: {
        gap: 4,
    },
    linkText: {
        textDecorationLine: "underline",
    },
    bioText: {
        lineHeight: 20,
    },
    reportText: {
        textDecorationLine: "underline",
    },
});
