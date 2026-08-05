import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { type UserProfile } from "@/lib/firepit";
import { getCachedUserProfile } from "@/lib/profile-cache";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { RelationshipActions } from "@/components/relationship-actions";

type Props = {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
    open: boolean;
    onClose: () => void;
    onViewFullProfile?: () => void;
};

const PRESET_FRAME_EMOJI: Record<string, string> = {
    star: "\u2B50",
    diamond: "\uD83D\uDC8E",
    square: "\u2B1C",
    round: "\u26AA",
    spring: "\uD83C\uDF38",
    summer: "\u2600\uFE0F",
    fall: "\uD83C\uDF42",
    winter: "\u2744\uFE0F",
};

function frameEmojiForPreset(preset?: string): string | null {
    if (!preset) return null;
    const lower = preset.toLowerCase();
    for (const [key, emoji] of Object.entries(PRESET_FRAME_EMOJI)) {
        if (lower.includes(key)) return emoji;
    }
    return "\u2728";
}

function splitGradientParts(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of input) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts;
}

function parseGradient(value: string): { colors: string[]; start: { x: number; y: number }; end: { x: number; y: number } } | null {
    const match = value.match(/linear-gradient\((.+?)\)/);
    if (!match) return null;
    const parts = splitGradientParts(match[1]).map((s) => s.trim());
    if (parts.length < 2) return null;
    const isAngle = /^-?\d+(\.\d+)?deg$/i.test(parts[0]);
    const angle = isAngle ? parseFloat(parts[0]) : 180;
    const rad = (angle * Math.PI) / 180;
    const colors = (isAngle ? parts.slice(1) : parts).map((c) => c.replace(/"/g, "").trim()).filter(Boolean);
    if (colors.length < 2) return null;
    return {
        colors: colors as [string, string, ...string[]],
        start: { x: 0.5 - Math.cos(rad) / 2, y: 0.5 + Math.sin(rad) / 2 },
        end: { x: 0.5 + Math.cos(rad) / 2, y: 0.5 - Math.sin(rad) / 2 },
    };
}

function statusColor(status?: string): { color: string; label: string } | null {
    if (!status) return null;
    const s = status.toLowerCase().replace(/[\s_-]/g, "");
    if (s === "online") return { color: "#22c55e", label: "Online" };
    if (s === "away" || s === "idle") return { color: "#f59e0b", label: "Away" };
    if (s === "dnd" || s === "donotdisturb") return { color: "#ef4444", label: "Do Not Disturb" };
    return { color: "#6b7280", label: "Offline" };
}

function getSafeUrl(url?: string | null): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
    } catch { /* ignore */ }
    return null;
}

export function UserProfileSheet({
    userId,
    displayName: initialName,
    avatarUrl: initialAvatar,
    open,
    onClose,
    onViewFullProfile,
}: Props) {
    const theme = useTheme();
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);

    const isSelf = currentUser?.$id === userId || currentUser?.userId === userId;

    useEffect(() => {
        if (!open || !instanceUrl || !accessToken || !userId) return;
        let cancelled = false;
        setLoading(true);
        getCachedUserProfile(instanceUrl, accessToken, userId)
            .then((p) => {
                if (!cancelled) setProfile(p as UserProfile | null);
            })
            .catch(() => {
                if (!cancelled) setProfile(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [open, instanceUrl, accessToken, userId]);

    const name = profile?.displayName || initialName || "Unknown User";
    const avatarUrl = profile?.avatarUrl || initialAvatar;
    const framePreset = profile?.avatarFramePreset;
    const frameUrl = profile?.avatarFrameUrl;
    const statusVal = typeof profile?.status === "string" ? profile.status : profile?.status?.status;
    const customMessage = typeof profile?.status === "object" ? profile.status?.customMessage : null;
    const sc = statusColor(statusVal);
    const websiteUrl = getSafeUrl(profile?.website);

    const gradient = profile?.profileBackgroundGradient ? parseGradient(profile.profileBackgroundGradient) : null;
    const hasBg = Boolean(profile?.profileBackgroundUrl || gradient || profile?.profileBackgroundColor);

    const frameInset = frameUrl ? 10 : 0;
    const avatarSize = 64;
    const innerSize = avatarSize - frameInset * 2;
    const frameEmoji = frameEmojiForPreset(framePreset ?? undefined);

    return (
        <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
                    {loading ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator color={theme.primary} />
                            <ThemedText themeColor="mutedForeground">Loading profile…</ThemedText>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                            {/* Background */}
                            {profile?.profileBackgroundUrl ? (
                                <View style={styles.bgImageWrap}>
                                    <Image source={{ uri: profile.profileBackgroundUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
                                </View>
                            ) : gradient ? (
                                <LinearGradient colors={gradient.colors as [string, string, ...string[]]} start={gradient.start} end={gradient.end} style={StyleSheet.absoluteFill} />
                            ) : profile?.profileBackgroundColor ? (
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: profile.profileBackgroundColor }]} />
                            ) : null}

                            {/* Content */}
                            <View style={[styles.content, hasBg ? { zIndex: 1 } : null]}>
                                {/* Avatar + Name */}
                                <View style={styles.avatarRow}>
                                    <View style={{ width: avatarSize, height: avatarSize, position: "relative" }}>
                                        {frameUrl ? (
                                            <Image source={{ uri: frameUrl }} style={[StyleSheet.absoluteFill, { zIndex: 1 }]} pointerEvents="none" contentFit="contain" />
                                        ) : null}
                                        <View style={{
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
                                            borderWidth: frameUrl ? 0 : 3,
                                            borderColor: theme.accent,
                                        }}>
                                            {avatarUrl ? (
                                                <Image source={{ uri: avatarUrl }} style={{ width: innerSize, height: innerSize }} contentFit="cover" />
                                            ) : (
                                                <ThemedText type="title" style={{ fontSize: 20 }}>{name[0]?.toUpperCase() ?? "?"}</ThemedText>
                                            )}
                                        </View>
                                        {frameEmoji && !frameUrl ? (
                                            <View style={{ position: "absolute", bottom: -2, right: -2, zIndex: 3 }}>
                                                <ThemedText style={{ fontSize: 14 }}>{frameEmoji}</ThemedText>
                                            </View>
                                        ) : null}
                                    </View>

                                    <View style={styles.nameCol}>
                                        <ThemedText type="title" numberOfLines={1}>{name}</ThemedText>
                                        {profile?.pronouns ? (
                                            <ThemedText themeColor="mutedForeground" style={{ fontSize: 13 }}>{profile.pronouns}</ThemedText>
                                        ) : null}
                                        {sc ? (
                                            <View style={styles.statusRow}>
                                                <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
                                                <ThemedText themeColor="mutedForeground" style={{ fontSize: 12 }}>
                                                    {sc.label}{customMessage ? ` — ${customMessage}` : ""}
                                                </ThemedText>
                                            </View>
                                        ) : null}
                                    </View>
                                </View>

                                {/* Bio */}
                                {profile?.bio ? (
                                    <View style={styles.section}>
                                        <ThemedText type="smallBold">About</ThemedText>
                                        <ThemedText style={{ fontSize: 14, lineHeight: 20 }}>{profile.bio}</ThemedText>
                                    </View>
                                ) : null}

                                {/* Info */}
                                {(profile?.location || websiteUrl) ? (
                                    <View style={styles.section}>
                                        <ThemedText type="smallBold">Information</ThemedText>
                                        {profile?.location ? (
                                            <View style={styles.infoRow}>
                                                <ThemedText themeColor="mutedForeground" style={{ fontSize: 13 }}>Location:</ThemedText>
                                                <ThemedText style={{ fontSize: 13 }}>{profile.location}</ThemedText>
                                            </View>
                                        ) : null}
                                        {websiteUrl ? (
                                            <Pressable onPress={() => Linking.openURL(websiteUrl)}>
                                                <View style={styles.infoRow}>
                                                    <ThemedText themeColor="mutedForeground" style={{ fontSize: 13 }}>Website:</ThemedText>
                                                    <ThemedText themeColor="foreground" style={{ fontSize: 13, textDecorationLine: "underline" }}>{profile?.website}</ThemedText>
                                                </View>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                ) : null}

                                {/* Actions */}
                                {!isSelf ? (
                                    <View style={styles.section}>
                                        <RelationshipActions targetUserId={userId} />
                                    </View>
                                ) : null}

                                {onViewFullProfile ? (
                                    <Pressable
                                        onPress={() => { onClose(); onViewFullProfile(); }}
                                        style={({ pressed }) => [styles.fullProfileBtn, { backgroundColor: theme.muted, opacity: pressed ? 0.8 : 1 }]}
                                    >
                                        <ThemedText type="smallBold">View Full Profile</ThemedText>
                                    </Pressable>
                                ) : null}
                            </View>
                        </ScrollView>
                    )}

                    {/* Close button */}
                    <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.muted }]}>
                        <ThemedText type="smallBold" themeColor="foreground">✕</ThemedText>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: Spacing.three,
    },
    sheet: {
        width: "100%",
        maxWidth: 380,
        borderRadius: 20,
        borderWidth: 1,
        overflow: "hidden",
        maxHeight: "80%",
    },
    loadingBox: {
        padding: Spacing.four,
        alignItems: "center",
        gap: Spacing.two,
    },
    scrollContent: {
        position: "relative",
    },
    bgImageWrap: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    content: {
        padding: Spacing.three,
        gap: Spacing.three,
    },
    avatarRow: {
        flexDirection: "row",
        gap: Spacing.two,
        alignItems: "center",
    },
    nameCol: {
        flex: 1,
        gap: 2,
    },
    statusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 2,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    section: {
        gap: Spacing.one,
    },
    infoRow: {
        flexDirection: "row",
        gap: Spacing.one,
    },
    fullProfileBtn: {
        alignItems: "center",
        paddingVertical: Spacing.two,
        borderRadius: 10,
    },
    closeBtn: {
        position: "absolute",
        top: Spacing.two,
        right: Spacing.two,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
    },
});
