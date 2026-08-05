import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing, type ThemeColor } from "@/constants/theme";
import { captureError } from "@/lib/sentry";

interface ErrorBoundaryFallbackProps {
  error: Error;
  resetError: () => void;
  palette: Record<ThemeColor, string>;
}

export function ErrorBoundaryFallback({
  error,
  resetError,
  palette,
}: ErrorBoundaryFallbackProps) {
  const [reported, setReported] = useState(false);
  const handleReport = useCallback(() => {
    captureError(error, {
      source: "error-boundary-fallback",
      userReported: true,
    });
    setReported(true);
  }, [error]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.background }]}
    >
      <View style={styles.content}>
        <ThemedText style={styles.emoji}>⚠️</ThemedText>
        <ThemedText style={styles.title}>Something went wrong</ThemedText>
        <ThemedText style={styles.message}>
          An unexpected error occurred. We've logged the details and you can try
          again.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.primary },
            pressed && { opacity: 0.8 },
          ]}
          onPress={resetError}
        >
          <ThemedText
            style={[styles.buttonText, { color: palette.primaryForeground }]}
          >
            Try Again
          </ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.linkButton,
            pressed && { opacity: 0.6 },
          ]}
          onPress={handleReport}
        >
          <ThemedText
            style={[styles.linkText, { color: palette.primary }]}
          >
            {reported ? "Reported — thank you" : "Report this issue"}
          </ThemedText>
        </Pressable>
      </View>
      {__DEV__ && (
        <View
          style={[styles.debugBox, { backgroundColor: palette.muted }]}
        >
          <ThemedText
            style={[styles.debugLabel, { color: palette.mutedForeground }]}
          >
            {error.name}: {error.message}
          </ThemedText>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.five,
  },
  emoji: {
    fontSize: 48,
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: Spacing.two,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: Spacing.five,
    opacity: 0.7,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: 12,
    marginBottom: Spacing.three,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    paddingVertical: Spacing.two,
  },
  linkText: {
    fontSize: 14,
  },
  debugBox: {
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.five,
    borderRadius: 8,
  },
  debugLabel: {
    fontSize: 12,
    fontFamily: "monospace",
  },
});
