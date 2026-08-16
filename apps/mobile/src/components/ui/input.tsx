import { forwardRef } from "react";
import { TextInput, TextInputProps } from "react-native";
import { useTheme } from "@/hooks/use-theme";

export const Input = forwardRef<TextInput, TextInputProps>(
  function Input(props, ref) {
    const colors = useTheme();

    return (
      <TextInput
        ref={ref}
        {...props}
        placeholderTextColor={colors.textSecondary}
        style={[
          {
            height: 40,
            paddingHorizontal: 10,
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
  },
);

export default Input;
