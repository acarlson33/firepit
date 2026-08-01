import React from "react";
import { Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";
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

  const bg =
    tone === "primary"
      ? theme.primary
      : tone === "secondary"
        ? theme.secondary
        : tone === "destructive"
          ? theme.destructive
          : theme.muted;

  const fg =
    tone === "primary"
      ? theme.primaryForeground
      : tone === "destructive"
        ? "#fff"
        : theme.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <ThemedText
        type="smallBold"
        style={{ color: fg, textAlign: "center" }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default ActionButton;
