import { View, Text, StyleSheet } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export function OfflineBanner() {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.destructive }]}>
      <Text style={styles.text}>You are offline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
