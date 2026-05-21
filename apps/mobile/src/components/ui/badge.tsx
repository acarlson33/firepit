import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type BadgeProps = {
  children: React.ReactNode;
};

export function Badge({ children }: BadgeProps) {
  const colors = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.accent,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: colors.accentForeground, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

export default Badge;
