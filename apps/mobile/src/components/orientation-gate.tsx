import React, { useEffect, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

function isPortrait(): boolean {
  const { width, height } = Dimensions.get("window");
  return height >= width;
}

export function OrientationGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [portrait, setPortrait] = useState(isPortrait());

  useEffect(() => {
    const onChange = () => {
      setPortrait(isPortrait());
    };
    const sub = Dimensions.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      {children}
      {!portrait && (
        <View
          style={[
            styles.overlay,
            { backgroundColor: theme.background },
          ]}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <ThemedText style={styles.icon}>📱</ThemedText>
            <ThemedText type="title" style={styles.title}>
              Rotate your device
            </ThemedText>
            <ThemedText
              themeColor="mutedForeground"
              style={styles.message}
            >
              Firepit is designed for portrait mode. Please rotate your device to
              continue.
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    zIndex: 10,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.five,
    alignItems: "center",
    maxWidth: 320,
    gap: Spacing.two,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
