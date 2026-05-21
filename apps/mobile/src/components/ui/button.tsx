import React from "react";
import { Pressable, Text, ViewStyle } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type ButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
};

export function Button({ children, onPress, style, disabled }: ButtonProps) {
  const colors = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: colors.primary,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        alignItems: "center",
        justifyContent: "center",
        ...(style as object),
      })}
    >
      <Text style={{ color: colors.primaryForeground }}>{children}</Text>
    </Pressable>
  );
}

export default Button;
