import React from "react";
import { Pressable, View, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";

type CheckboxProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
};

export function Checkbox({ checked = false, onChange, label }: CheckboxProps) {
  const colors = useTheme();

  return (
    <Pressable
      onPress={() => onChange?.(!checked)}
      style={{ flexDirection: "row", alignItems: "center" }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          backgroundColor: checked ? colors.primary : colors.backgroundElement,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 8,
        }}
      >
        {checked ? <Text style={{ color: colors.primaryForeground }}>✓</Text> : null}
      </View>
      {label ? <Text style={{ color: colors.text }}>{label}</Text> : null}
    </Pressable>
  );
}

export default Checkbox;
