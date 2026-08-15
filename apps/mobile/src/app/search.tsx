import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import MessageWithMentions from "@/components/message-with-mentions";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { searchMessages, type SearchMessageResult } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

function resultContextLabel(result: SearchMessageResult) {
    if (result.type === "channel") {
        return [result.serverId, result.channelId].filter(Boolean).join(" / ") || "channel";
    }

    return result.conversationId ?? "conversation";
}

export default function SearchScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken, state } = useFirepitBootstrap();
    const [query, setQuery] = useState("");
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<SearchMessageResult[]>([]);

    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);

    const runSearch = useCallback(
        async (nextQuery: string) => {
            if (!instanceUrl || !accessToken) {
                return;
            }

            const trimmed = nextQuery.trim();
            if (trimmed.length < 2) {
                setResults([]);
                setLoadState("idle");
                setError(null);
                return;
            }

            setLoadState("loading");
            setError(null);

            try {
                const response = await searchMessages(instanceUrl, accessToken, trimmed);
                setResults(response.results ?? []);
                setLoadState("ready");
            } catch (searchError) {
                setLoadState("error");
                setError(
                    searchError instanceof Error
                        ? searchError.message
                        : "Unable to search messages",
                );
            }
        },
        [accessToken, instanceUrl],
    );

    const retrySearch = useCallback(() => {
        void runSearch(query);
    }, [query, runSearch]);

    useRetryOnReconnect(loadState === "error", retrySearch);

    const openResult = useCallback((result: SearchMessageResult) => {
        if (result.type === "channel" && result.serverId && result.channelId) {
            router.push({
                pathname: "/server/messages/[serverId]/[channelId]",
                params: {
                    serverId: result.serverId,
                    channelId: result.channelId,
                },
            });
            return;
        }
        if (result.type === "dm" && result.conversationId) {
            router.push(`/dm/${result.conversationId}` as never);
            return;
        }
        if (result.type === "server" && result.serverId) {
            router.push({
                pathname: "/server/messages/[serverId]",
                params: { serverId: result.serverId },
            });
        }
    }, []);

    const renderItem = useCallback(
        ({ item }: { item: SearchMessageResult }) => (
            <SearchResultCard result={item} onPress={() => openResult(item)} />
        ),
        [openResult],
    );

    return (
        <AuthRouteGuard>
            <FlatList
                data={results}
                keyExtractor={(item, index) => item.message.$id ?? `${item.type}-${index}`}
                ListHeaderComponent={
                    <SafeAreaView style={styles.safeArea}>
                        <ThemedView style={styles.shell}>
                            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                <ThemedText type="code" themeColor="accent">
                                    Search
                                </ThemedText>
                                <ThemedText type="title">Message search</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    Search messages and jump straight into the right channel or conversation.
                                </ThemedText>
                                <TextInput
                                    editable={signedIn}
                                    placeholder="Search messages, e.g. from:alex or has:image"
                                    placeholderTextColor={theme.mutedForeground}
                                    value={query}
                                    onChangeText={setQuery}
                                    onSubmitEditing={() => void runSearch(query)}
                                    style={[
                                        styles.input,
                                        { borderColor: theme.border, color: theme.foreground },
                                    ]}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => void runSearch(query)}
                                    style={({ pressed }) => [
                                        styles.button,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed ? 0.88 : 1,
                                        },
                                    ]}
                                >
                                    <ThemedText type="smallBold" themeColor="primaryForeground">
                                        {loadState === "loading" ? "Searching…" : "Search"}
                                    </ThemedText>
                                </Pressable>
                                {error ? <ThemedText themeColor="destructive">{error}</ThemedText> : null}
                                {loadState === "ready" ? (
                                    <ThemedText themeColor="mutedForeground">
                                        {results.length} result{results.length === 1 ? "" : "s"}
                                    </ThemedText>
                                ) : null}
                            </ThemedView>
                        </ThemedView>
                    </SafeAreaView>
                }
                ListEmptyComponent={
                    loadState === "loading" ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator />
                        </View>
                    ) : (
                        <SafeAreaView style={styles.safeArea}>
                            <ThemedView style={styles.shell}>
                                <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                    <ThemedText themeColor="mutedForeground">
                                        Enter at least two characters to search.
                                    </ThemedText>
                                </ThemedView>
                            </ThemedView>
                        </SafeAreaView>
                    )
                }
                renderItem={renderItem}
                windowSize={5}
                maxToRenderPerBatch={10}
                initialNumToRender={10}
                removeClippedSubviews
                contentContainerStyle={styles.listContent}
                style={{ backgroundColor: theme.background, flex: 1 }}
            />
        </AuthRouteGuard>
    );
}

function SearchResultCard({
    result,
    onPress,
}: {
    result: SearchMessageResult;
    onPress: () => void;
}) {
    const theme = useTheme();
    const message = result.message;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.resultWrap, { opacity: pressed ? 0.88 : 1 }]}
        >
            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.resultHeader}>
                    <ThemedText type="smallBold">
                        {message.userName ?? message.userId ?? "Unknown user"}
                    </ThemedText>
                    <ThemedText type="code" themeColor="mutedForeground">
                        {resultContextLabel(result)}
                    </ThemedText>
                </View>
                <MessageWithMentions text={message.text ?? ""} />
                <View style={styles.resultFooter}>
                    <ThemedText type="code" themeColor="mutedForeground">
                        {result.type === "channel" ? "Open channel context" : "Open conversation context"}
                    </ThemedText>
                    {message.$createdAt ? (
                        <ThemedText type="code" themeColor="mutedForeground">
                            {new Date(message.$createdAt).toLocaleString()}
                        </ThemedText>
                    ) : null}
                </View>
            </ThemedView>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: BottomTabInset + Spacing.four,
    },
    safeArea: {
        paddingHorizontal: Spacing.three,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
    },
    card: {
        borderRadius: 22,
        borderWidth: 1,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    input: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 52,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    button: {
        borderRadius: 999,
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    loadingWrap: {
        padding: Spacing.four,
        alignItems: "center",
    },
    resultWrap: {
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.three,
    },
    resultHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    resultFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
});
