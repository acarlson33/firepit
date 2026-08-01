import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn: "https://74183b0682fef4020487ca90ca072b1f@o4508242166153216.ingest.us.sentry.io/4511684848123904",

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
