import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,

    sendDefaultPii: false,
    enableLogs: false,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration()],

    debug: false,
    environment:
      (Constants.expoConfig?.extra?.appEnv as string) || "development",
  });
}

export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  Sentry.captureException(error, { extra: context });
}

export { Sentry };
