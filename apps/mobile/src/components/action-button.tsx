import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
};

export function ActionButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}: ActionButtonProps) {
  const theme = useTheme();

  const bg: Record<NonNullable<ActionButtonProps["tone"]>, string> = {
    primary: theme.primary,
    secondary: theme.secondary,
    ghost: theme.muted,
    destructive: theme.destructive,
  };

  const fg: Record<NonNullable<ActionButtonProps["tone"]>, string> = {
    primary: theme.primaryForeground,
    secondary: theme.foreground,
    ghost: theme.foreground,
    destructive: theme.destructiveForeground,
  };

  function getOpacity(disabled: boolean, pressed: boolean): number {
    if (disabled) return 0.5;
    if (pressed) return 0.85;
    return 1;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg[tone],
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        opacity: getOpacity(disabled, pressed),
      })}
    >
      <ThemedText
        type="smallBold"
        style={{ color: fg[tone], textAlign: "center" }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function StatusPill({
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
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
});

export default ActionButton;
