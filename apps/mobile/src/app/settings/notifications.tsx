import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    DEFAULT_NOTIFICATION_PREFERENCES,
    type NotificationPreferences,
} from "@/lib/firepit/persistence";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

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

export default function NotificationSettingsScreen() {
    const theme = useTheme();
    const { notificationPreferences, saveNotificationPreferences } =
        useFirepitBootstrap();

    const [prefs, setPrefs] = useState<NotificationPreferences>(
        notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    );
    const [saved, setSaved] = useState(false);
    const [testStatus, setTestStatus] = useState<null | "sent" | "denied">(null);
    const [permissionGranted, setPermissionGranted] = useState(false);

    useEffect(() => {
        if (notificationPreferences) {
            setPrefs(notificationPreferences);
        }
    }, [notificationPreferences]);

    useEffect(() => {
        let cancelled = false;
        Notifications.getPermissionsAsync().then(({ status }) => {
            if (!cancelled) setPermissionGranted(status === "granted");
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const update = useCallback(
        (partial: Partial<NotificationPreferences>) => {
            setPrefs((prev) => {
                const next = { ...prev, ...partial };
                return next;
            });
            setSaved(false);
        },
        [],
    );

    const handleSave = useCallback(async () => {
        await saveNotificationPreferences(prefs);
        setSaved(true);
    }, [prefs, saveNotificationPreferences]);

    const handleTestNotification = useCallback(async () => {
        try {
            const { status } = await Notifications.getPermissionsAsync();
            if (status !== "granted") {
                const { status: requested } =
                    await Notifications.requestPermissionsAsync();
                if (requested !== "granted") {
                    setTestStatus("denied");
                    return;
                }
            }
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Firepit test notification",
                    body: "If you see this, push notifications are working!",
                    sound: true,
                },
                trigger: null,
            });
            Alert.alert(
                "Test notification sent",
                "Check your notification tray. If the app is in the foreground, minimize it to see the banner.",
            );
            setTestStatus("sent");
        } catch (_err) {
            setTestStatus("denied");
        }
    }, []);

    const enabled = prefs.enabled;

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
                        <ThemedView
                            type="card"
                            style={[styles.heroCard, { borderColor: theme.border }]}
                        >
                            <ThemedText type="code" themeColor="accent">
                                Notification settings
                            </ThemedText>
                            <ThemedText type="title">
                                Push notifications
                            </ThemedText>
                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Configure when and how you receive push notifications.
                                Changes are saved to this device.
                            </ThemedText>
                            <View style={styles.pillRow}>
                                <StatusPill
                                    label={
                                        permissionGranted ? "enabled" : "disabled"
                                    }
                                    tone={permissionGranted ? "success" : "warning"}
                                />
                                {saved ? (
                                    <StatusPill label="saved" tone="success" />
                                ) : null}
                            </View>
                        </ThemedView>

                        {/* Master toggle */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">General</ThemedText>
                            <ToggleRow
                                label="Enable push notifications"
                                description="Receive notifications on this device"
                                value={prefs.enabled}
                                onValueChange={(v) => update({ enabled: v })}
                            />
                        </ThemedView>

                        {/* Test notification */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Test</ThemedText>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => void handleTestNotification()}
                                style={({ pressed }) => [
                                    styles.testButton,
                                    {
                                        backgroundColor: theme.accent,
                                        opacity: pressed ? 0.88 : 1,
                                    },
                                ]}
                            >
                                <ThemedText
                                    type="smallBold"
                                    themeColor="foreground"
                                >
                                    Send test notification
                                </ThemedText>
                            </Pressable>
                            {testStatus === "sent" ? (
                                <ThemedText themeColor="foreground">
                                    Notification sent! Check your notification tray.
                                </ThemedText>
                            ) : null}
                            {testStatus === "denied" ? (
                                <ThemedText themeColor="destructive">
                                    Permission denied. Enable notifications in
                                    system settings.
                                </ThemedText>
                            ) : null}
                        </ThemedView>

                        {/* Notification types */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Notification types</ThemedText>
                            <ToggleRow
                                label="Direct messages"
                                description="Notify for new DMs"
                                value={prefs.dmNotifications}
                                onValueChange={(v) =>
                                    update({ dmNotifications: v })
                                }
                                disabled={!enabled}
                            />
                            <ToggleRow
                                label="Mentions"
                                description="Notify when you are mentioned"
                                value={prefs.mentionNotifications}
                                onValueChange={(v) =>
                                    update({ mentionNotifications: v })
                                }
                                disabled={!enabled}
                            />
                        </ThemedView>

                        {/* Quiet hours */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold">Quiet hours</ThemedText>
                            <ToggleRow
                                label="Enable quiet hours"
                                description="Pause notifications during set hours"
                                value={prefs.quietHoursEnabled}
                                onValueChange={(v) =>
                                    update({ quietHoursEnabled: v })
                                }
                                disabled={!enabled}
                            />
                            {enabled && prefs.quietHoursEnabled ? (
                                <View style={styles.timeRow}>
                                    <View style={styles.timeField}>
                                        <ThemedText
                                            type="code"
                                            themeColor="mutedForeground"
                                        >
                                            Start
                                        </ThemedText>
                                        <TextInput
                                            placeholder="22:00"
                                            placeholderTextColor={theme.mutedForeground}
                                            value={prefs.quietHoursStart}
                                            onChangeText={(v) =>
                                                update({ quietHoursStart: v })
                                            }
                                            style={[
                                                styles.timeInput,
                                                {
                                                    backgroundColor: theme.card,
                                                    borderColor: theme.input,
                                                    color: theme.foreground,
                                                },
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.timeField}>
                                        <ThemedText
                                            type="code"
                                            themeColor="mutedForeground"
                                        >
                                            End
                                        </ThemedText>
                                        <TextInput
                                            placeholder="08:00"
                                            placeholderTextColor={theme.mutedForeground}
                                            value={prefs.quietHoursEnd}
                                            onChangeText={(v) =>
                                                update({ quietHoursEnd: v })
                                            }
                                            style={[
                                                styles.timeInput,
                                                {
                                                    backgroundColor: theme.card,
                                                    borderColor: theme.input,
                                                    color: theme.foreground,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>
                            ) : null}
                        </ThemedView>

                        {/* Save */}
                        <ThemedView
                            type="card"
                            style={[styles.card, { borderColor: theme.border }]}
                        >
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
                                    Preferences saved successfully.
                                </ThemedText>
                            ) : null}
                        </ThemedView>
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
    );
}

function ToggleRow({
    label,
    description,
    value,
    onValueChange,
    disabled,
}: {
    label: string;
    description?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    const theme = useTheme();
    return (
        <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
                <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
                {description ? (
                    <ThemedText
                        themeColor="mutedForeground"
                        style={styles.toggleDescription}
                    >
                        {description}
                    </ThemedText>
                ) : null}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={value ? "#FFFFFF" : "#888888"}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: {},
    safeArea: {
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
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
        gap: Spacing.three,
        paddingTop: Spacing.four,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.one,
        gap: Spacing.two,
    },
    toggleCopy: { flex: 1, gap: 2 },
    toggleLabel: { fontSize: 15 },
    toggleDescription: { fontSize: 13, lineHeight: 18 },
    timeRow: {
        flexDirection: "row",
        gap: Spacing.three,
    },
    timeField: { flex: 1, gap: Spacing.one },
    timeInput: {
        borderWidth: 1,
        borderRadius: 12,
        minHeight: 44,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontSize: 15,
    },
    saveButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.two,
        alignItems: "center",
    },
    testButton: {
        borderRadius: 12,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        alignItems: "center",
    },
});
