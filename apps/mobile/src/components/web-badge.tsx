import { version } from "expo/package.json";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { Spacing } from "@/constants/theme";

export function WebBadge() {
  return (
    <ThemedView type="card" style={styles.container}>
      <View style={styles.brandMark} />
      <View style={styles.textBlock}>
        <ThemedText type="smallBold">Firepit</ThemedText>
        <ThemedText
          type="code"
          themeColor="textSecondary"
          style={styles.versionText}
        >
          v{version}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.five,
    gap: Spacing.three,
    borderRadius: 24,
    borderWidth: 1,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#d9792b",
  },
  textBlock: {
    gap: 2,
  },
  versionText: {
    textAlign: "left",
  },
});
