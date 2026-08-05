import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useState, useEffect } from "react";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { useCacheSettings } from "@/providers/cache-settings-context";
import { type CacheStrategy } from "@/lib/cache/CacheManager";
import { APP_VERSION } from "@/lib/update/constants";

function StatusPill({
    label,
    tone,
}: {
    label: string;
    tone: "neutral" | "success" | "warning" | "danger";
}) {
    const theme = useTheme();
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

function SettingsRow({
    label,
    description,
    onPress,
}: {
    label: string;
    description: string;
    onPress: () => void;
}) {
    const theme = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.settingsRow,
                {
                    backgroundColor: theme.muted,
                    opacity: pressed ? 0.92 : 1,
                },
            ]}
        >
            <View style={styles.settingsRowCopy}>
                <ThemedText type="smallBold">{label}</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.settingsRowDesc}>
                    {description}
                </ThemedText>
            </View>
            <ThemedText type="code" themeColor="mutedForeground">
                ›
            </ThemedText>
        </Pressable>
    );
}

type CacheStrategyOption = {
  value: CacheStrategy;
  label: string;
  desc: string;
};

const CACHE_STRATEGIES: CacheStrategyOption[] = [
  { value: "aggressive", label: "Aggressive", desc: "Pictures, emojis, messages, media" },
  { value: "medium", label: "Medium", desc: "Pictures, emojis, DMs" },
  { value: "minimal", label: "Minimal", desc: "Pictures & emojis only" },
  { value: "none", label: "None", desc: "No caching" },
];

function CacheSettingsSection() {
  const theme = useTheme();
  const { strategy, setStrategy, cacheSize, refreshCacheSize, clearCache } =
    useCacheSettings();
  const [expanded, setExpanded] = useState(false);

  const handleClear = () => {
    Alert.alert(
      "Clear Cache",
      `This will remove ${cacheSize} of cached data. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearCache();
            Alert.alert("Cache cleared", "All cached data has been removed.");
          },
        },
      ],
    );
  };

  const current = CACHE_STRATEGIES.find((s) => s.value === strategy);

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Cache & Troubleshooting</ThemedText>

      <View style={[styles.cacheCard, { backgroundColor: theme.muted }]}>
        <View style={styles.cacheHeader}>
          <ThemedText type="smallBold">Storage Used</ThemedText>
          <ThemedText type="code" themeColor="mutedForeground">
            {cacheSize}
          </ThemedText>
        </View>

        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => [
            styles.strategySelector,
            { opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <View>
            <ThemedText type="smallBold">Caching Strategy</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.strategyDesc}>
              {current?.label} — {current?.desc}
            </ThemedText>
          </View>
          <ThemedText type="code" themeColor="mutedForeground">
            {expanded ? "▲" : "▼"}
          </ThemedText>
        </Pressable>

        {expanded && (
          <View style={styles.strategyOptions}>
            {CACHE_STRATEGIES.map((s) => (
              <Pressable
                key={s.value}
                onPress={async () => {
                  await setStrategy(s.value);
                  setExpanded(false);
                }}
                style={({ pressed }) => [
                  styles.strategyOption,
                  {
                    backgroundColor:
                      strategy === s.value ? theme.primary + "20" : "transparent",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <ThemedText
                  type={strategy === s.value ? "smallBold" : "default"}
                  themeColor={strategy === s.value ? "foreground" : "mutedForeground"}
                >
                  {s.label}
                </ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.optionDesc}>
                  {s.desc}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.cacheActions}>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.clearButton,
              {
                backgroundColor: theme.destructive + "15",
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <ThemedText type="smallBold" themeColor="destructive">
              Clear Cache
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={refreshCacheSize}
            style={({ pressed }) => [
              styles.refreshButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText type="code" themeColor="mutedForeground">
              ↻ Refresh
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function SettingsTabScreen() {
    const theme = useTheme();
    const { currentUser, instanceUrl, notificationPreferences } =
        useFirepitBootstrap();

    const [notifPermission, setNotifPermission] = useState(false);
    useEffect(() => {
        let cancelled = false;
        Notifications.getPermissionsAsync().then(({ status }) => {
            if (!cancelled) setNotifPermission(status === "granted");
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const notifEnabled =
        notifPermission || (notificationPreferences?.enabled ?? false);

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbTop,
                    { backgroundColor: "rgba(217, 121, 43, 0.08)" },
                ]}
            />
            <View
                pointerEvents="none"
                style={[
                    styles.backdropOrbBottom,
                    { backgroundColor: "rgba(78, 138, 134, 0.06)" },
                ]}
            />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.shell}>
                        {/* Hero header */}
                        <View style={styles.heroHeader}>
                            <ThemedText type="code" themeColor="accent">
                                Firepit settings
                            </ThemedText>
                            <ThemedText type="title">Settings</ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Account, notifications, and app preferences.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        currentUser?.displayName ??
                                        currentUser?.userName ??
                                        "signed in"
                                    }
                                    tone="success"
                                />
                                {instanceUrl ? (
                                    <StatusPill
                                        label={safeHostname(instanceUrl)}
                                        tone="neutral"
                                    />
                                ) : (
                                    <StatusPill label="no instance" tone="warning" />
                                )}
                            </View>
                        </View>

                        {/* Account section */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">Account</ThemedText>
                            <View style={styles.accountInfo}>
                                <View style={styles.accountRow}>
                                    <ThemedText type="code" themeColor="mutedForeground">
                                        Display name
                                    </ThemedText>
                                    <ThemedText>
                                        {currentUser?.displayName ?? "Not set"}
                                    </ThemedText>
                                </View>
                                <View style={styles.accountRow}>
                                    <ThemedText type="code" themeColor="mutedForeground">
                                        User ID
                                    </ThemedText>
                                    <ThemedText type="code">
                                        {currentUser?.$id ?? "—"}
                                    </ThemedText>
                                </View>
                                <View style={styles.accountRow}>
                                    <ThemedText type="code" themeColor="mutedForeground">
                                        Email
                                    </ThemedText>
                                    <ThemedText>
                                        {currentUser?.email ?? "Not available"}
                                    </ThemedText>
                                </View>
                            </View>
                        </View>

                        {/* Profile category */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">Profile</ThemedText>
                            <SettingsRow
                                label="Edit Profile"
                                description="Display name, pronouns, bio, location, and website"
                                onPress={() =>
                                    router.push("/settings/profile" as never)
                                }
                            />
                            <SettingsRow
                                label="Appearance"
                                description="Profile background and avatar frame"
                                onPress={() =>
                                    router.push("/settings/appearance" as never)
                                }
                            />
                        </View>

                        {/* Notifications category */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">Notifications</ThemedText>
                            <SettingsRow
                                label="Push Notifications"
                                description={
                                    notifEnabled
                                        ? "Push notifications enabled"
                                        : "Push notifications disabled"
                                }
                                onPress={() =>
                                    router.push("/settings/notifications" as never)
                                }
                            />
                        </View>

                        {/* Connections category */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">Connections</ThemedText>
                            <SettingsRow
                                label="Friends"
                                description="Manage friends, requests, and blocked users"
                                onPress={() =>
                                    router.push("/friends" as never)
                                }
                            />
                            <SettingsRow
                                label="Privacy & Blocking"
                                description="View and manage blocked users"
                                onPress={() =>
                                    router.push("/settings/privacy" as never)
                                }
                            />
                        </View>

                        {/* App Updates category */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">App Updates</ThemedText>
                            <SettingsRow
                                label="Update Settings"
                                description="Automatic updates and release notifications"
                                onPress={() =>
                                    router.push("/settings/updates" as never)
                                }
                            />
                        </View>

                        {/* Cache section */}
                        <CacheSettingsSection />

                        {/* About section */}
                        <View style={styles.section}>
                            <ThemedText type="smallBold">About</ThemedText>
                            <View style={styles.accountInfo}>
                                <View style={styles.accountRow}>
                                    <ThemedText type="code" themeColor="mutedForeground">
                                        Version
                                    </ThemedText>
                                    <ThemedText type="code">
                                        {APP_VERSION}
                                    </ThemedText>
                                </View>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.two,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
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
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    section: {
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: Spacing.two,
        gap: Spacing.two,
    },
    pill: {
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.half,
        borderRadius: 12,
    },
    accountInfo: { gap: Spacing.two },
    accountRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: Spacing.two,
    },
    settingsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.two,
        borderRadius: 12,
        padding: Spacing.two,
    },
    settingsRowCopy: { flex: 1, gap: 2 },
    settingsRowDesc: { fontSize: 13, lineHeight: 18 },
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
    cacheCard: {
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.two,
    },
    cacheHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    strategySelector: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: Spacing.one,
    },
    strategyDesc: {
        fontSize: 12,
        marginTop: 2,
    },
    strategyOptions: {
        gap: Spacing.half,
    },
    strategyOption: {
        padding: Spacing.two,
        borderRadius: 8,
        gap: 2,
    },
    optionDesc: {
        fontSize: 11,
    },
    cacheActions: {
        flexDirection: "row",
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    clearButton: {
        flex: 1,
        padding: Spacing.two,
        borderRadius: 8,
        alignItems: "center",
    },
    refreshButton: {
        paddingHorizontal: Spacing.two,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
});
