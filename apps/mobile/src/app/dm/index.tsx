import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    FlatList,
    Pressable,
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
    type DirectMessageConversation,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { getConversations, enrichConversations } from "@/lib/server-cache";

type LoadState = "idle" | "loading" | "ready" | "error";

function hasId(
    conversation: DirectMessageConversation,
): conversation is DirectMessageConversation & { $id: string } {
    return typeof conversation.$id === "string" && conversation.$id.length > 0;
}

function formatConversationTime(value?: string | null) {
    if (!value) {
        return "now";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "now";
    }

    return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
    });
}

function conversationTitle(conversation: DirectMessageConversation) {
    if (conversation.name?.trim()) {
        return conversation.name.trim();
    }

    if (conversation.isGroup) {
        return `Group chat${conversation.participantCount ? ` · ${conversation.participantCount}` : ""}`;
    }

    return (
        conversation.otherUser?.displayName?.trim() ||
        conversation.otherUser?.userId ||
        "Direct message"
    );
}

function conversationSubtitle(conversation: DirectMessageConversation) {
    if (conversation.isGroup) {
        return conversation.participantCount
            ? `${conversation.participantCount} participants`
            : "Group conversation";
    }

    if (conversation.otherUser?.pronouns) {
        return conversation.otherUser.pronouns;
    }

    return conversation.participants?.length
        ? `${conversation.participants.length} participants`
        : "Direct conversation";
}

export default function DirectMessageListScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken, currentUser, state } = useFirepitBootstrap();
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [conversations, setConversations] = useState<DirectMessageConversation[]>([]);

    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);
    const requestBaseUrl = instanceUrl ?? "";
    const requestToken = accessToken ?? "";
    const readyToFetch = signedIn && requestBaseUrl.length > 0 && requestToken.length > 0;

    const loadConversations = useCallback(async () => {
        if (!instanceUrl || !accessToken) {
            return;
        }

        setLoadState("loading");
        setError(null);
        try {
            const raw = await getConversations(instanceUrl, accessToken);
            const currentUserId = currentUser?.$id ?? currentUser?.userId ?? "";
            const enriched = await enrichConversations(instanceUrl, accessToken, raw, currentUserId);
            setConversations(enriched);
            setLoadState("ready");
        } catch (loadError) {
            setConversations([]);
            setLoadState("error");
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load conversations",
            );
        }
    }, [accessToken, instanceUrl, currentUser?.$id, currentUser?.userId]);

    const normalizedConversations = useMemo(
        () => conversations.filter(hasId),
        [conversations],
    );

    useEffect(() => {
        if (!readyToFetch) {
            setConversations([]);
            setLoadState("idle");
            setError(null);
            return;
        }

        void loadConversations();
    }, [readyToFetch, loadConversations]);

    useRetryOnReconnect(loadState === "error", loadConversations);

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <FlatList
                        data={normalizedConversations}
                        keyExtractor={(item) => item.$id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={
                            <ThemedView style={styles.shell}>
                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.heroCard,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText type="code" themeColor="accent">
                                        Direct messages
                                    </ThemedText>
                                    <ThemedText type="title">
                                        Your conversations
                                    </ThemedText>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        Open a conversation to read and reply. Profile pages can
                                        also start new DMs.
                                    </ThemedText>
                                    <View style={styles.metaRow}>
                                        <StatusPill
                                            label={
                                                loadState === "ready"
                                                    ? `${normalizedConversations.length} conversations`
                                                    : "loading conversations"
                                            }
                                            tone={
                                                loadState === "ready"
                                                    ? "success"
                                                    : loadState === "error"
                                                      ? "danger"
                                                      : "warning"
                                            }
                                        />
                                        <StatusPill
                                            label={
                                                currentUser?.displayName ??
                                                currentUser?.userName ??
                                                currentUser?.$id ??
                                                "signed in"
                                            }
                                            tone="neutral"
                                        />
                                    </View>
                                </ThemedView>

                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.card,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <View style={styles.sectionHeaderRow}>
                                        <ThemedText type="smallBold">
                                            Conversations
                                        </ThemedText>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => void loadConversations()}
                                            style={({ pressed }) => [
                                                styles.inlineButton,
                                                {
                                                    backgroundColor: theme.muted,
                                                    borderColor: theme.border,
                                                    opacity: pressed ? 0.88 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor="foreground"
                                            >
                                                Refresh
                                            </ThemedText>
                                        </Pressable>
                                    </View>
                                    {error ? (
                                        <ThemedText themeColor="destructive">
                                            {error}
                                        </ThemedText>
                                    ) : null}
                                    {loadState === "loading" ? (
                                        <ThemedText themeColor="mutedForeground">
                                            Loading conversations…
                                        </ThemedText>
                                    ) : null}
                                </ThemedView>
                            </ThemedView>
                        }
                        ListEmptyComponent={
                            loadState === "ready" ? (
                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.emptyCard,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText type="smallBold">
                                        No direct messages yet
                                    </ThemedText>
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={styles.copy}
                                    >
                                        Open a profile page to start a new conversation.
                                    </ThemedText>
                                </ThemedView>
                            ) : null
                        }
                        renderItem={renderConversationItem}
                        windowSize={7}
                        maxToRenderPerBatch={10}
                        initialNumToRender={10}
                        removeClippedSubviews
                    />
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

const renderConversationItem = ({ item }: { item: DirectMessageConversation }) => (
    <ConversationCard conversation={item} />
);

function ConversationCard({ conversation }: { conversation: DirectMessageConversation }) {
    const theme = useTheme();
    const title = conversationTitle(conversation);
    const subtitle = conversationSubtitle(conversation);
    const avatarUrl = conversation.avatarUrl ?? conversation.otherUser?.avatarUrl ?? null;
    const avatarLetter = title.slice(0, 1).toUpperCase();

    return (
        <ThemedView
            type="card"
            style={[styles.conversationCard, { borderColor: theme.border }]}
        >
            <Pressable
                accessibilityRole="button"
                onPress={() => {
                    if (!conversation.$id) {
                        return;
                    }
                    router.push(`/dm/${conversation.$id}` as never);
                }}
                style={({ pressed }) => [
                    styles.conversationPressable,
                    pressed && styles.conversationPressed,
                ]}
            >
                <View style={styles.avatarShell}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                    ) : (
                        <ThemedText type="smallBold">{avatarLetter}</ThemedText>
                    )}
                </View>

                <View style={styles.conversationCopy}>
                    <View style={styles.conversationTopRow}>
                        <ThemedText type="smallBold" style={styles.titleText}>
                            {title}
                        </ThemedText>
                        <ThemedText type="code" themeColor="mutedForeground">
                            {formatConversationTime(conversation.lastMessageAt)}
                        </ThemedText>
                    </View>
                    <ThemedText themeColor="mutedForeground" style={styles.copy}>
                        {subtitle}
                    </ThemedText>
                    {conversation.otherUser?.displayName ? (
                        <ThemedText type="code" themeColor="mutedForeground">
                            @{conversation.otherUser.displayName}
                        </ThemedText>
                    ) : null}
                </View>
            </Pressable>

            {conversation.otherUser?.userId ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                        router.push(`/user/${encodeURIComponent(conversation.otherUser!.userId)}` as never)
                    }
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
                        Profile
                    </ThemedText>
                </Pressable>
            ) : null}
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

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
    },
    listContent: {
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
    emptyCard: {
        borderWidth: 1,
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        marginTop: Spacing.three,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
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
    conversationCard: {
        borderWidth: 1,
        borderRadius: 22,
        padding: Spacing.three,
        marginTop: Spacing.three,
        gap: Spacing.two,
    },
    conversationPressable: {
        flexDirection: "row",
        gap: Spacing.three,
        alignItems: "center",
    },
    conversationPressed: {
        opacity: 0.92,
    },
    avatarShell: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: "rgba(217, 121, 43, 0.14)",
    },
    avatar: {
        width: "100%",
        height: "100%",
    },
    conversationCopy: {
        flex: 1,
        gap: 4,
    },
    conversationTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    titleText: {
        flex: 1,
    },
});
