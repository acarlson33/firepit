import { View, type ViewProps } from "react-native";

import { ThemeColor } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/use-theme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  type,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  let backgroundColor: string;
  if (type !== undefined) {
    backgroundColor = theme[type];
  } else if (scheme === "dark") {
    backgroundColor = darkColor ?? theme.background;
  } else {
    backgroundColor = lightColor ?? theme.background;
  }

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
