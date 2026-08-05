import { forwardRef } from "react";
import { TextInput } from "react-native";
import type { TextInputProps } from "react-native";
import { useTheme } from "@/hooks/use-theme";

export const Input = forwardRef<TextInput, TextInputProps>((props, ref) => {
  const colors = useTheme();

  return (
    <TextInput
      ref={ref}
      {...props}
      placeholderTextColor={colors.textSecondary}
      style={[
        {
          minHeight: 40,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.input,
          color: colors.text,
          backgroundColor: colors.backgroundElement,
        },
        props.style,
      ]}
    />
  );
});

export default Input;
