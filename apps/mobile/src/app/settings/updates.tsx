import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type UpdateSettings,
  type UpdateFrequency,
  type UpdateNotificationPreference,
  type UpdateChannel,
  UPDATE_FREQUENCY_LABELS,
  UPDATE_NOTIFICATION_LABELS,
  UPDATE_CHANNEL_LABELS,
  DEFAULT_UPDATE_SETTINGS,
} from "@/lib/update/types";
import {
  loadUpdateSettings,
  saveUpdateSettings,
} from "@/lib/update/service";
import { APP_VERSION } from "@/lib/update/constants";
import { getDeviceCpuArch } from "@/lib/cpu-arch";
import { useUpdate } from "@/providers/update-provider";

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const currentLabel = options.find((o) => o.key === value)?.label ?? value;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [
          styles.selectRow,
          {
            backgroundColor: theme.muted,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.selectRowCopy}>
          <ThemedText type="smallBold">{label}</ThemedText>
          {description ? (
            <ThemedText
              themeColor="mutedForeground"
              style={styles.selectRowDesc}
            >
              {description}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="code" themeColor="mutedForeground">
          {expanded ? "▲" : "▼"} {currentLabel}
        </ThemedText>
      </Pressable>

      {expanded ? (
        <View style={[styles.optionsList, { borderColor: theme.border }]}>
          {options.map((opt) => {
            const selected = opt.key === value;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                onPress={() => {
                  onChange(opt.key);
                  setExpanded(false);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: selected
                      ? theme.accentSoft
                      : "transparent",
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionLabel,
                    selected && { fontWeight: "600" },
                  ]}
                >
                  {opt.label}
                </ThemedText>
                {selected ? (
                  <ThemedText type="code" themeColor="accent">
                    ✓
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function UpdateSettingsScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState<UpdateSettings>({
    ...DEFAULT_UPDATE_SETTINGS,
  });
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const { checkNow, updateSettings } = useUpdate();

  useEffect(() => {
    void loadUpdateSettings().then(setSettings);
  }, []);

  const update = useCallback(
    (partial: Partial<UpdateSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const next = { ...settings, setupComplete: true };
    await saveUpdateSettings(next);
    setSettings(next);
    setSaved(true);
  }, [settings]);

  const handleCheckNow = useCallback(async () => {
    setChecking(true);
    try {
      // Sync current UI settings to the provider so checkNow uses them
      const next = { ...settings, setupComplete: true };
      await updateSettings(next);
      await checkNow();
    } catch (err) {
      console.error("[update] checkNow failed:", err);
    } finally {
      setChecking(false);
    }
  }, [checkNow, updateSettings, settings]);

  const frequencyOptions = (
    Object.keys(UPDATE_FREQUENCY_LABELS) as UpdateFrequency[]
  ).map((key) => ({
    key,
    label: UPDATE_FREQUENCY_LABELS[key],
  }));

  const notifyOptions = (
    Object.keys(UPDATE_NOTIFICATION_LABELS) as UpdateNotificationPreference[]
  ).map((key) => ({
    key,
    label: UPDATE_NOTIFICATION_LABELS[key],
  }));

  const channelOptions = (
    Object.keys(UPDATE_CHANNEL_LABELS) as UpdateChannel[]
  ).map((key) => ({
    key,
    label: UPDATE_CHANNEL_LABELS[key],
  }));

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.shell}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <ThemedText type="smallBold" themeColor="foreground">
                Back
              </ThemedText>
            </Pressable>
            <View style={styles.headerButton} />
          </View>
          {/* Hero */}
          <View style={styles.heroHeader}>
            <ThemedText type="code" themeColor="accent">
              App updates
            </ThemedText>
            <ThemedText type="title">Updates</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.copy}>
              Configure automatic updates and notifications. Current version:{" "}
              {APP_VERSION}.
            </ThemedText>
            <ThemedText type="code" themeColor="mutedForeground" style={styles.archRow}>
              {getDeviceCpuArch()}
            </ThemedText>
          </View>

          {/* Update frequency */}
          <View style={styles.section}>
            <ThemedText type="smallBold">Automatic updates</ThemedText>
            <SelectRow
              label="Update frequency"
              description="How often to check and install updates"
              value={settings.frequency}
              options={frequencyOptions}
              onChange={(v) => update({ frequency: v as UpdateFrequency })}
            />
          </View>

          {/* Notifications */}
          <View style={styles.section}>
            <ThemedText type="smallBold">Notifications</ThemedText>
            <SelectRow
              label="Notify me about"
              description="When to send push notifications for new releases"
              value={settings.notifyPreference}
              options={notifyOptions}
              onChange={(v) =>
                update({ notifyPreference: v as UpdateNotificationPreference })
              }
            />
          </View>

          {/* Channel */}
          <View style={styles.section}>
            <ThemedText type="smallBold">Release channel</ThemedText>
            <SelectRow
              label="Release channel"
              description="Which releases to track"
              value={settings.channel}
              options={channelOptions}
              onChange={(v) => update({ channel: v as UpdateChannel })}
            />
          </View>

          {/* Check now */}
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleCheckNow()}
              disabled={checking}
              style={({ pressed }) => [
                styles.checkButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed || checking ? 0.7 : 1,
                },
              ]}
            >
              {checking ? (
                <ActivityIndicator
                  size="small"
                  color={theme.primaryForeground}
                />
              ) : (
                <ThemedText
                  type="smallBold"
                  themeColor="primaryForeground"
                >
                  Check for updates now
                </ThemedText>
              )}
            </Pressable>
          </View>

          {/* Save */}
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                themeColor="primaryForeground"
              >
                Save preferences
              </ThemedText>
            </Pressable>
            {saved ? (
              <ThemedText themeColor="foreground">
                Update preferences saved.
              </ThemedText>
            ) : null}
          </View>
        </ThemedView>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.two,
  },
  headerButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    minWidth: 60,
  },
  shell: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    gap: Spacing.two,
  },
  heroHeader: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
  },
  copy: { fontSize: 14, lineHeight: 20 },
  archRow: { fontSize: 11, lineHeight: 16, opacity: 0.6 },
  section: {
    gap: Spacing.two,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
    borderRadius: 12,
    padding: Spacing.two,
  },
  selectRowCopy: { flex: 1, gap: 2 },
  selectRowDesc: { fontSize: 13, lineHeight: 18 },
  optionsList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: Spacing.half,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  optionLabel: { fontSize: 14 },
  checkButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  saveButton: {
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
});
