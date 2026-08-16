import React from "react";
import { View, ViewProps } from "react-native";
import { useTheme } from "@/hooks/use-theme";

export function Card({ children, ...props }: ViewProps) {
  const colors = useTheme();

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.card,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
        },
        (props as any).style,
      ]}
    >
      {children}
    </View>
  );
}

export default Card;
