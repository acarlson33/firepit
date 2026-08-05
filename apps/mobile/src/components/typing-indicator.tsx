import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

function safeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Someone";
  if (trimmed.length > 12 && /^[a-zA-Z0-9]+$/.test(trimmed)) return "Someone";
  return trimmed;
}

export function TypingIndicator({ names }: { names: string[] }) {
  const theme = useTheme();

  if (names.length === 0) return null;

  const cleaned = names.map(safeName);
  let label: string;
  if (cleaned.length === 1) {
    label = `${cleaned[0]} is typing`;
  } else if (cleaned.length === 2) {
    label = `${cleaned[0]} and ${cleaned[1]} are typing`;
  } else {
    label = `${cleaned.length} people are typing`;
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.primary + "15", borderWidth: 1, borderColor: theme.primary + "30" }]}>
      <View style={[styles.dot, { backgroundColor: theme.primary }]} />
      <Text style={[styles.text, { color: theme.foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontStyle: "italic",
  },
});
