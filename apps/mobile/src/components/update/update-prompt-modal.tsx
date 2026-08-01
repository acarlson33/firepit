import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { UpdateCheckResult } from "@/lib/update/types";
import { formatVersion } from "@/lib/update/version";
import { extractChangelog } from "@/lib/update/github";
import {
  downloadApk,
  installApk,
  deleteApk,
} from "@/lib/update/checker";

type Props = {
  result: UpdateCheckResult | null;
  onDismiss: (skipVersion: boolean) => void;
  onSettings: () => void;
};

export function UpdatePromptModal({ result, onDismiss, onSettings }: Props) {
  const theme = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const changelog = result?.release
    ? extractChangelog(result.release.body)
    : "";

  const handleDownload = useCallback(async () => {
    if (!result?.release) return;

    setDownloading(true);
    setError(null);
    setProgress(0);

    try {
      const apkAsset = result.apkAsset ?? result.release.assets.find(
        (a) => a.name.endsWith(".apk"),
      );

      if (!apkAsset) {
        setError("No APK found for this release.");
        setDownloading(false);
        return;
      }

      const apkUri = await downloadApk(apkAsset.browserDownloadUrl, (p) => {
        setProgress(p);
      });

      await installApk(apkUri);
      // If install succeeds, the app will be closed by the installer; the
      // delayed delete covers the cancelled case, startup cleanup the rest.
      // ponytail: fixed 30s delay; the installer reads the file asynchronously,
      // delete immediately risks a failed install. No knob needed unless a
      // device shows install failures.
      setTimeout(() => void deleteApk(apkUri), 30_000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Download failed. Try again later.",
      );
      setDownloading(false);
    }
  }, [result]);

  if (!result?.hasUpdate) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => onDismiss(false)}
    >
      <View style={styles.overlay}>
        <ThemedView
          type="card"
          style={[styles.card, { borderColor: theme.border }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <ThemedText type="code" themeColor="foreground">
              {result.isSecurityUpdate ? "Security update" : "Update available"}
            </ThemedText>

            <ThemedText type="title" style={styles.title}>
              {result.release?.name ?? formatVersion(result.latestVersion.raw)}
            </ThemedText>

            <View style={styles.versionRow}>
              <ThemedText type="code" themeColor="mutedForeground">
                {formatVersion(result.currentVersion.raw)}
              </ThemedText>
              <ThemedText type="code" themeColor="mutedForeground">
                →
              </ThemedText>
              <ThemedText type="code" themeColor="foreground">
                {formatVersion(result.latestVersion.raw)}
              </ThemedText>
            </View>

            {changelog ? (
              <ThemedText
                themeColor="mutedForeground"
                style={styles.changelog}
              >
                {changelog}
              </ThemedText>
            ) : null}

            {error ? (
              <ThemedText themeColor="destructive" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            {downloading ? (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: theme.primary,
                    },
                  ]}
                />
                <ThemedText type="code" themeColor="mutedForeground">
                  {Math.round(progress * 100)}%
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDismiss(true)}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: theme.muted,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <ThemedText type="smallBold">Skip this version</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => onSettings()}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: theme.muted,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <ThemedText type="smallBold">Settings</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => void handleDownload()}
              disabled={downloading}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed || downloading ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText type="smallBold" themeColor="primaryForeground">
                {downloading ? "Downloading..." : "Update now"}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: "80%",
  },
  scroll: {
    maxHeight: 400,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    marginTop: Spacing.half,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  changelog: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.one,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: Spacing.one,
  },
  progressContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: Spacing.two,
    position: "relative",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    padding: Spacing.four,
    paddingTop: 0,
  },
  primaryButton: {
    flex: 1,
    minWidth: 120,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
  },
});
