import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type TabPlaceholderScreenProps = {
    eyebrow: string;
    title: string;
    description: string;
    badgeLabel: string;
    badgeTone?: "neutral" | "success" | "warning" | "danger";
};

export function TabPlaceholderScreen({
    eyebrow,
    title,
    description,
    badgeLabel,
    badgeTone = "neutral",
}: TabPlaceholderScreenProps) {
    const theme = useTheme();

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>
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
                    <ThemedView type="card" style={styles.card}>
                        <ThemedText type="code" themeColor="accent">
                            {eyebrow}
                        </ThemedText>
                        <ThemedText type="title" style={styles.title}>
                            {title}
                        </ThemedText>
                        <ThemedText
                            themeColor="mutedForeground"
                            style={styles.description}
                        >
                            {description}
                        </ThemedText>
                        <StatusPill label={badgeLabel} tone={badgeTone} />
                    </ThemedView>
                </ThemedView>
            </SafeAreaView>
        </View>
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
    root: {
        flex: 1,
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
        justifyContent: "center",
    },
    card: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
    },
    title: {},
    description: {
        fontSize: 16,
        lineHeight: 24,
    },
    pill: {
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
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
