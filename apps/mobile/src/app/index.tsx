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
            variant === "secondary" ? theme.secondary : theme.primary,
          borderColor: variant === "secondary" ? theme.border : theme.primary,
        },
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <ThemedText
        type="smallBold"
        style={styles.buttonLabel}
        themeColor={variant === "primary" ? "primaryForeground" : "foreground"}
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
    compatibility,
    error,
    currentUser,
  } = useFirepitBootstrap();
  const theme = useTheme();
  const [candidateUrl, setCandidateUrl] = useState(instanceUrl ?? "");
  const [instanceError, setInstanceError] = useState<string | null>(null);

  const instanceReady = Boolean(instanceUrl && compatibility?.compatible);
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
      router.replace("/explore");
    }
    if (instanceUrl && state === "needs-auth") {
      router.replace("/login");
    }
  }, [instanceUrl, signedIn, state]);

  const handleInstanceSubmit = async () => {
    const normalized = normalizeInstanceUrl(candidateUrl);
    if (!normalized) {
      setInstanceError("Enter a valid Firepit instance URL.");
      return;
    }

    try {
      setInstanceError(null);
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
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.background }]} />
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
              Firepit mobile instance setup
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Connect the app to a Firepit instance.
            </ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.description}>
              After the instance is accepted, you will move to the login route
              and sign in there before opening the chat workspace.
            </ThemedText>
          </ThemedView>

          {needsInstance ? (
            <ThemedView
              type="card"
              style={[styles.panel, { borderColor: theme.border }]}
            >
              <ThemedText type="subtitle">Instance</ThemedText>
              <ThemedText
                themeColor="mutedForeground"
                style={styles.panelDescription}
              >
                Enter the Firepit base URL. The client will normalize the URL,
                validate compatibility, and cache it locally.
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
                label={state === "loading" ? "Checking instance…" : "Continue"}
                disabled={state === "loading" || !canCheckInstance}
                onPress={handleInstanceSubmit}
              />

              {instanceError || error ? (
                <ThemedText themeColor="danger" style={styles.metaText}>
                  {instanceError ?? error}
                </ThemedText>
              ) : null}
            </ThemedView>
          ) : null}

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
                label={instanceReady ? "instance ready" : "instance pending"}
                tone={instanceReady ? "success" : "warning"}
              />
              <StatusPill
                label={
                  signedIn
                    ? "signed in"
                    : instanceUrl
                      ? "login next"
                      : "instance required"
                }
                tone={signedIn ? "success" : "warning"}
              />
            </View>

            {compatibility?.reason ? (
              <ThemedText themeColor="danger" style={styles.metaText}>
                {compatibility.reason}
              </ThemedText>
            ) : null}

            {instanceUrl ? (
              <ThemedText themeColor="mutedForeground" style={styles.metaText}>
                Instance {instanceUrl}
              </ThemedText>
            ) : null}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
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
  description: {
    fontSize: 16,
    lineHeight: 24,
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
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  metaText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
