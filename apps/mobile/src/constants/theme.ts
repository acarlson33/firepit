/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    background: "#FBF8F2",
    foreground: "#3A2D25",
    card: "#FFFDFB",
    cardForeground: "#3A2D25",
    popover: "#FFFDFB",
    popoverForeground: "#3A2D25",
    primary: "#D9792B",
    primaryForeground: "#FBF8F2",
    secondary: "#F2E8D7",
    secondaryForeground: "#3A2D25",
    muted: "#EDE3D3",
    mutedForeground: "#7A6657",
    accent: "#EBDCC3",
    accentForeground: "#3A2D25",
    destructive: "#C94A36",
    destructiveForeground: "#FBF8F2",
    border: "#E4D8C8",
    input: "#E4D8C8",
    ring: "#D9792B",
    sidebar: "#FFF9F0",
    sidebarForeground: "#3A2D25",
    sidebarPrimary: "#D9792B",
    sidebarPrimaryForeground: "#FBF8F2",
    sidebarAccent: "#F5EEE2",
    sidebarAccentForeground: "#3A2D25",
    sidebarBorder: "#E4D8C8",
    sidebarRing: "#D9792B",
    chart1: "#D9792B",
    chart2: "#4E8A86",
    chart3: "#5E6F90",
    chart4: "#D18A37",
    chart5: "#A45E4D",
    success: "#DCEFE7",
    warning: "#F5E5C3",
    danger: "#F8E0DA",
    backgroundElement: "#FFFDFB",
    backgroundSelected: "#F1E8D8",
    text: "#3A2D25",
    textSecondary: "#7A6657",
    accentSoft: "#EBDCC3",
  },
  dark: {
    background: "#1A1512",
    foreground: "#F8F2E8",
    card: "#241D18",
    cardForeground: "#F8F2E8",
    popover: "#241D18",
    popoverForeground: "#F8F2E8",
    primary: "#E08B3D",
    primaryForeground: "#1A140F",
    secondary: "#2A231D",
    secondaryForeground: "#F8F2E8",
    muted: "#2F2720",
    mutedForeground: "#CBB9A8",
    accent: "#322821",
    accentForeground: "#F8F2E8",
    destructive: "#D86A57",
    destructiveForeground: "#1A140F",
    border: "#3A3027",
    input: "#45362C",
    ring: "#E08B3D",
    sidebar: "#1F1914",
    sidebarForeground: "#F8F2E8",
    sidebarPrimary: "#E08B3D",
    sidebarPrimaryForeground: "#1A140F",
    sidebarAccent: "#2A231D",
    sidebarAccentForeground: "#F8F2E8",
    sidebarBorder: "#3A3027",
    sidebarRing: "#E08B3D",
    chart1: "#E08B3D",
    chart2: "#72A7A1",
    chart3: "#C9A46C",
    chart4: "#A272D7",
    chart5: "#CC7F64",
    success: "#21463F",
    warning: "#4B361F",
    danger: "#452522",
    backgroundElement: "#241D18",
    backgroundSelected: "#2A231D",
    text: "#F8F2E8",
    textSecondary: "#CBB9A8",
    accentSoft: "#322821",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
