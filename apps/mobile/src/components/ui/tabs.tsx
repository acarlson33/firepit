import React from "react";
import { View, Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type TabsProps = {
  tabs: string[];
  activeIndex?: number;
  onChange?: (index: number) => void;
};

export function Tabs({ tabs, activeIndex = 0, onChange }: TabsProps) {
  const colors = useTheme();

  return (
    <View style={{ flexDirection: "row" }}>
      {tabs.map((t, i) => (
        <Pressable
          key={t}
          onPress={() => onChange?.(i)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderBottomWidth: activeIndex === i ? 2 : 1,
            borderBottomColor: activeIndex === i ? colors.primary : colors.border,
          }}
        >
          <Text style={{ color: colors.text }}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default Tabs;
