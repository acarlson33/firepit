import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
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

export default function LoginScreen() {
    const { instanceUrl, state, authenticate, currentUser, resetConnection } =
        useFirepitBootstrap();
    const theme = useTheme();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState<string | null>(null);

    const signedIn = state === "ready" && Boolean(currentUser);

    useEffect(() => {
        if (signedIn) {
            router.replace("/home");
        }
    }, [signedIn]);

    useEffect(() => {
        if (!instanceUrl) {
            router.replace("/");
        }
    }, [instanceUrl]);

    const handleSignIn = async () => {
        try {
            setAuthError(null);
            await authenticate(email.trim(), password);
            router.replace("/home");
        } catch (signInError) {
            setAuthError(
                signInError instanceof Error
                    ? signInError.message
                    : "Unable to authenticate",
            );
        }
    };

    return (
        <ScrollView
            style={[styles.scrollView, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.scrollContent}
        >
            <View
                style={[styles.backdrop, { backgroundColor: theme.background }]}
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
                        style={[styles.heroCard, { borderColor: theme.border }]}
                    >
                        <ThemedText type="code" themeColor="accent">
                            Firepit login
                        </ThemedText>
                        <ThemedText type="title" style={styles.title}>
                            Sign in to the connected instance.
                        </ThemedText>
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.description}
                        >
                            Use a valid account for the selected Firepit
                            instance. Once you sign in, the app sends you to the
                            home tabs.
                        </ThemedText>
                    </ThemedView>

                    <ThemedView
                        type="card"
                        style={[styles.panel, { borderColor: theme.border }]}
                    >
                        <ThemedText type="subtitle">Instance</ThemedText>
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.panelDescription}
                        >
                            {instanceUrl ?? "No instance configured"}
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

                        <FirepitButton
                            label={
                                state === "loading" ? "Signing in…" : "Sign in"
                            }
                            disabled={
                                state === "loading" ||
                                !email.trim() ||
                                !password
                            }
                            onPress={handleSignIn}
                        />

                        <FirepitButton
                            label="Change instance"
                            variant="secondary"
                            onPress={async () => {
                                await resetConnection();
                                router.replace("/");
                            }}
                        />

                        {authError ? (
                            <ThemedText
                                themeColor="danger"
                                style={styles.metaText}
                            >
                                {authError}
                            </ThemedText>
                        ) : null}
                    </ThemedView>

                    <ThemedView
                        type="card"
                        style={[styles.panel, { borderColor: theme.border }]}
                    >
                        <ThemedText type="subtitle">Status</ThemedText>
                        <View style={styles.statusRow}>
                            <StatusPill
                                label={
                                    state === "loading"
                                        ? "loading"
                                        : state === "ready"
                                          ? "ready"
                                          : state
                                }
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
                                    instanceUrl
                                        ? "instance set"
                                        : "instance missing"
                                }
                                tone={instanceUrl ? "success" : "warning"}
                            />
                            <StatusPill
                                label={
                                    signedIn
                                        ? "signed in"
                                        : "awaiting credentials"
                                }
                                tone={signedIn ? "success" : "warning"}
                            />
                        </View>
                    </ThemedView>
                </ThemedView>
            </SafeAreaView>
        </ScrollView>
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
            style={styles.pill}
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
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    backdrop: { ...StyleSheet.absoluteFill },
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
    description: { fontSize: 16, lineHeight: 24 },
    panel: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    panelDescription: { fontSize: 14, lineHeight: 20 },
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
    buttonPressed: { opacity: 0.85 },
    buttonDisabled: { opacity: 0.5 },
    buttonLabel: { fontSize: 16 },
    statusRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    metaText: { fontSize: 13, lineHeight: 18 },
});
