import React from "react";
import { Image, View, Text, ImageSourcePropType } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type AvatarProps = {
  uri?: string;
  size?: number;
  initials?: string;
};

export function Avatar({ uri, size = 40, initials }: AvatarProps) {
  const colors = useTheme();

  if (uri) {
    return (
      <Image
        source={{ uri } as ImageSourcePropType}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.muted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.mutedForeground }}>{initials ?? "?"}</Text>
    </View>
  );
}

export default Avatar;
