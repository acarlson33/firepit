import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { normalizeInstanceUrl } from "@/lib/firepit/bootstrap";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

function FirepitButton({
    label,
    onPress,
    disabled,
    variant = "primary",
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: "primary" | "secondary";
}) {
    const theme = useTheme();

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                {
                    backgroundColor:
                        variant === "secondary"
                            ? theme.secondary
                            : theme.primary,
                    borderColor:
                        variant === "secondary" ? theme.border : theme.primary,
                },
                pressed && !disabled && styles.buttonPressed,
                disabled && styles.buttonDisabled,
            ]}
        >
            <ThemedText
                type="smallBold"
                style={styles.buttonLabel}
                themeColor={
                    variant === "primary" ? "primaryForeground" : "foreground"
                }
            >
                {label}
            </ThemedText>
        </Pressable>
    );
}

export default function HomeScreen() {
    const {
        state,
        bootstrapInstance,
        instanceUrl,
        error,
        currentUser,
        resetConnection,
        refresh,
    } = useFirepitBootstrap();
    const theme = useTheme();
    const [candidateUrl, setCandidateUrl] = useState(instanceUrl ?? "");
    const [instanceError, setInstanceError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const needsInstance = !instanceUrl;
    const signedIn = state === "ready" && Boolean(currentUser);
    const canCheckInstance = candidateUrl.trim().length > 0;

    useEffect(() => {
        if (instanceUrl) {
            setCandidateUrl(instanceUrl);
        }
    }, [instanceUrl]);

    useEffect(() => {
        if (signedIn) {
            router.replace("/home");
        }
        if (instanceUrl && state === "needs-auth") {
            router.replace("/login");
        }
    }, [instanceUrl, signedIn, state]);

    if (state === "loading") {
        return (
            <View
                style={[
                    styles.loadingScreen,
                    { backgroundColor: theme.background },
                ]}
            >
                <ThemedView
                    type="card"
                    style={[styles.loadingCard, { borderColor: theme.border }]}
                >
                    <ActivityIndicator color={theme.primary} />
                    <ThemedText type="subtitle" style={styles.loadingTitle}>
                        Restoring Firepit
                    </ThemedText>
                    <ThemedText
                        themeColor="mutedForeground"
                        style={styles.description}
                    >
                        Restoring your session…
                    </ThemedText>
                </ThemedView>
            </View>
        );
    }

    if (state === "instance-unreachable" || state === "instance-error") {
        return (
            <View style={[styles.screen, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <ThemedView style={styles.shell}>
                            <ThemedView
                                type="card"
                                style={[styles.heroCard, { borderColor: theme.border }]}
                            >
                                <ThemedText type="code" themeColor="accent">
                                    {state === "instance-unreachable" ? "Instance not found" : "Instance error"}
                                </ThemedText>
                                <ThemedText type="title" style={styles.title}>
                                    {state === "instance-unreachable"
                                        ? "This does not look like a Firepit server"
                                        : "Something went wrong on the server"}
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.description}
                                >
                                    {error ?? (state === "instance-unreachable"
                                        ? "The URL does not appear to be a Firepit instance."
                                        : "The server returned an error. Please try again later.")}
                                </ThemedText>
                            </ThemedView>

                            {instanceUrl ? (
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.metaText}
                                >
                                    Instance {instanceUrl}
                                </ThemedText>
                            ) : null}

                            <View style={{ flexDirection: "row", gap: Spacing.two }}>
                                {state === "instance-error" ? (
                                    <FirepitButton
                                        label="Retry"
                                        variant="secondary"
                                        onPress={() => void refresh()}
                                    />
                                ) : null}
                                <FirepitButton
                                    label="Change instance"
                                    variant="secondary"
                                    onPress={resetConnection}
                                />
                            </View>
                        </ThemedView>
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    const handleInstanceSubmit = async () => {
        const normalized = normalizeInstanceUrl(candidateUrl);
        if (!normalized) {
            setInstanceError("Enter a valid Firepit instance URL.");
            return;
        }

        try {
            setInstanceError(null);
            setSubmitting(true);
            const nextCompatibility = await bootstrapInstance(normalized);
            if (nextCompatibility?.compatible) {
                router.replace("/login");
            }
        } catch (bootstrapError) {
            setInstanceError(
                bootstrapError instanceof Error
                    ? bootstrapError.message
                    : "Unable to reach this instance.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <ThemedView style={styles.shell}>
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Firepit mobile instance setup
                            </ThemedText>
                            <ThemedText type="title" style={styles.title}>
                                Connect to your instance
                            </ThemedText>
                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.description}
                            >
                                Enter the instance URL to get started.
                            </ThemedText>
                        </ThemedView>

                        {needsInstance ? (
                            <ThemedView
                                type="card"
                                style={[
                                    styles.panel,
                                    { borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="subtitle">Instance</ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.panelDescription}
                                >
                                    Input the instance base URL.
                                </ThemedText>

                                <TextInput
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="url"
                                    placeholder="https://firepit.example.com"
                                    placeholderTextColor={theme.mutedForeground}
                                    value={candidateUrl}
                                    onChangeText={setCandidateUrl}
                                    style={[
                                        styles.input,
                                        {
                                            borderColor: theme.input,
                                            backgroundColor: theme.card,
                                            color: theme.foreground,
                                        },
                                    ]}
                                />

                                <FirepitButton
                                    label="Continue to login"
                                    disabled={!canCheckInstance || submitting}
                                    onPress={handleInstanceSubmit}
                                />

                                {instanceError || error ? (
                                    <ThemedText
                                        themeColor="danger"
                                        style={styles.metaText}
                                    >
                                        {instanceError ?? error}
                                    </ThemedText>
                                ) : null}
                            </ThemedView>
                        ) : null}
                    </ThemedView>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
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
        gap: Spacing.four,
        paddingTop: Spacing.four,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    title: {},
    description: {
        fontSize: 16,
        lineHeight: 24,
    },
    loadingScreen: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.three,
    },
    loadingCard: {
        width: "100%",
        maxWidth: MaxContentWidth,
        gap: Spacing.two,
        padding: Spacing.four,
        borderRadius: 28,
        borderWidth: 1,
        alignItems: "center",
    },
    loadingTitle: {
        textAlign: "center",
    },
    panel: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    panelDescription: {
        fontSize: 14,
        lineHeight: 20,
    },
    input: {
        borderRadius: 16,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderWidth: 1,
        fontSize: 16,
    },
    button: {
        minHeight: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.four,
        borderWidth: 1,
        shadowColor: "#d9792b",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },
    buttonPressed: {
        opacity: 0.85,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonLabel: {
        fontSize: 16,
    },
    metaText: {
        fontSize: 13,
        lineHeight: 18,
    },
});
