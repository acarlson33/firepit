import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { createServer } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

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

function TogglePill({
    label,
    selected,
    onPress,
}: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    const theme = useTheme();

    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.togglePill,
                {
                    backgroundColor: selected ? theme.primary : theme.card,
                    borderColor: selected ? theme.primary : theme.border,
                    opacity: pressed ? 0.88 : 1,
                },
            ]}
        >
            <ThemedText
                type="smallBold"
                themeColor={selected ? "primaryForeground" : "foreground"}
            >
                {label}
            </ThemedText>
        </Pressable>
    );
}

export default function CreateServerScreen() {
    const { state, instanceUrl, accessToken, featureFlags } =
        useFirepitBootstrap();
    const theme = useTheme();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isPublic, setIsPublic] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canCreateServers = Boolean(featureFlags?.enabled);
    const readyToCreate = state === "ready" && Boolean(instanceUrl && accessToken);

    const submitLabel = useMemo(() => {
        if (isSubmitting) {
            return "Creating…";
        }

        return "Create server";
    }, [isSubmitting]);

    useEffect(() => {
        if (!canCreateServers) {
            return;
        }

        if (!name.trim()) {
            setError(null);
        }
    }, [canCreateServers, name]);

    const handleCreate = async () => {
        if (!instanceUrl || !accessToken) {
            setError("Sign in first to create a server.");
            return;
        }

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError("Give the server a name first.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            const response = await createServer(instanceUrl, accessToken, {
                name: trimmedName,
                description: description.trim() || undefined,
                isPublic,
            });
            const nextServerId = response.server?.$id;
            if (!nextServerId) {
                throw new Error("Server was created, but no server id was returned.");
            }
            router.replace(`/server/${nextServerId}`);
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : "Unable to create server",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

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
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Create server
                            </ThemedText>
                            <ThemedText type="title" style={styles.title}>
                                Start a new Firepit server.
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Give your server a name, add a short description,
                                and choose whether it should be public. If the
                                instance disables user-created servers, this
                                screen will keep the entry point hidden elsewhere
                                in the app.
                            </ThemedText>
                        </ThemedView>

                        <ThemedView
                            type="card"
                            style={[styles.panel, { borderColor: theme.border }]}
                        >
                            {!canCreateServers ? (
                                <View style={styles.stateStack}>
                                    <ThemedText type="smallBold">
                                        Server creation is unavailable.
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground">
                                        This instance has disabled user-created
                                        servers.
                                    </ThemedText>
                                </View>
                            ) : !readyToCreate ? (
                                <View style={styles.stateStack}>
                                    <ThemedText type="smallBold">
                                        Sign in first.
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground">
                                        You need an active session to create a
                                        server.
                                    </ThemedText>
                                </View>
                            ) : (
                                <View style={styles.form}>
                                    <View style={styles.fieldStack}>
                                        <ThemedText type="smallBold">
                                            Server name
                                        </ThemedText>
                                        <TextInput
                                            autoCapitalize="words"
                                            autoCorrect={false}
                                            placeholder="My new server"
                                            placeholderTextColor={theme.mutedForeground}
                                            value={name}
                                            onChangeText={setName}
                                            style={[
                                                styles.input,
                                                {
                                                    backgroundColor: theme.card,
                                                    borderColor: theme.input,
                                                    color: theme.foreground,
                                                },
                                            ]}
                                        />
                                    </View>

                                    <View style={styles.fieldStack}>
                                        <ThemedText type="smallBold">
                                            Description
                                        </ThemedText>
                                        <TextInput
                                            autoCapitalize="sentences"
                                            autoCorrect
                                            multiline
                                            numberOfLines={4}
                                            placeholder="A place for project updates, memes, and planning."
                                            placeholderTextColor={theme.mutedForeground}
                                            value={description}
                                            onChangeText={setDescription}
                                            style={[
                                                styles.textArea,
                                                {
                                                    backgroundColor: theme.card,
                                                    borderColor: theme.input,
                                                    color: theme.foreground,
                                                },
                                            ]}
                                        />
                                    </View>

                                    <View style={styles.fieldStack}>
                                        <ThemedText type="smallBold">
                                            Visibility
                                        </ThemedText>
                                        <View style={styles.toggleRow}>
                                            <TogglePill
                                                label="Public"
                                                selected={isPublic}
                                                onPress={() => setIsPublic(true)}
                                            />
                                            <TogglePill
                                                label="Private"
                                                selected={!isPublic}
                                                onPress={() => setIsPublic(false)}
                                            />
                                        </View>
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            style={styles.metaText}
                                        >
                                            {isPublic
                                                ? "Public servers can appear in discovery, if the instance allows it."
                                                : "Private servers are joinable only by invite or direct membership."}
                                        </ThemedText>
                                    </View>

                                    <ActionButton
                                        label={submitLabel}
                                        disabled={
                                            isSubmitting || !name.trim().length
                                        }
                                        onPress={() => {
                                            void handleCreate();
                                        }}
                                    />

                                    <ActionButton
                                        label="Back to home"
                                        tone="ghost"
                                        onPress={() => router.replace("/home")}
                                    />

                                    {error ? (
                                        <ThemedText
                                            themeColor="danger"
                                            style={styles.metaText}
                                        >
                                            {error}
                                        </ThemedText>
                                    ) : null}
                                </View>
                            )}
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
    fieldStack: {
        gap: Spacing.one,
    },
    input: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 48,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 16,
    },
    textArea: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 112,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 16,
        textAlignVertical: "top",
    },
    toggleRow: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    togglePill: {
        flex: 1,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
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
