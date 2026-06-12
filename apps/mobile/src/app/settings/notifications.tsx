import { useCallback, useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
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

export default function NotificationSettingsScreen() {
    const theme = useTheme();
    const { notificationPreferences, saveNotificationPreferences } =
        useFirepitBootstrap();

    const [prefs, setPrefs] = useState<NotificationPreferences>(
        notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    );
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (notificationPreferences) {
            setPrefs(notificationPreferences);
        }
    }, [notificationPreferences]);

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

    const enabled = prefs.enabled;

    return (
        <AuthRouteGuard>
            <ScrollView
                style={[styles.scrollView, { backgroundColor: theme.background }]}
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
                    <ThemedView style={styles.shell}>
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
                                    label={enabled ? "enabled" : "disabled"}
                                    tone={enabled ? "success" : "warning"}
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
                                <ThemedText themeColor="accent">
                                    Preferences saved successfully.
                                </ThemedText>
                            ) : null}
                        </ThemedView>
                    </ThemedView>
                </SafeAreaView>
            </ScrollView>
        </AuthRouteGuard>
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
                trackColor={{ false: theme.muted, true: theme.primary }}
                thumbColor={value ? theme.primaryForeground : theme.card}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -100,
        left: -80,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -140,
        bottom: 20,
    },
    safeArea: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
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
});
