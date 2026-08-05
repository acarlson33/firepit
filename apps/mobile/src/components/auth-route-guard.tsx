import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type AuthRouteGuardProps = {
  children: import("react").ReactNode;
  redirectTo?: string;
};

export function AuthRouteGuard({
  children,
  redirectTo = "/",
}: AuthRouteGuardProps) {
  const { accessToken, currentUser, instanceUrl, state } =
    useFirepitBootstrap();
  const theme = useTheme();
  const mountedRef = useRef(true);

  const isAuthenticated =
    state === "ready" && Boolean(accessToken) && Boolean(currentUser);
  const isResolving = state === "loading";
  const needsRedirect = !isResolving && !isAuthenticated;
  let redirectTarget = redirectTo;
  if (redirectTo === "/") {
    if (instanceUrl) {
      redirectTarget = "/login";
    } else {
      redirectTarget = "/";
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Redirect in a useEffect (runs after paint, so navigation transitions are complete).
  // The 50ms delay gives React time to process any pending state updates from refresh.
  useEffect(() => {
    if (!needsRedirect) return;

    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      try {
        router.replace(redirectTarget as never);
      } catch {
        // Stack may have been reset
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [needsRedirect, redirectTarget]);

  if (needsRedirect || isResolving) {
    return (
      <View style={[styles.shell, { backgroundColor: theme.background }]}>
        <ThemedView
          type="card"
          style={[styles.card, { borderColor: theme.border }]}
        >
          <ThemedText type="code" themeColor="accent">
            Firepit auth gate
          </ThemedText>
          <ThemedText type="subtitle">Checking your session.</ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.copy}>
            This screen stays locked until an instance is selected and a valid
            account session is present.
          </ThemedText>
        </ThemedView>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
  },
});
