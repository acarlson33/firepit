import { Platform } from "react-native";
import {
  type UpdateCheckResult,
  type UpdateSettings,
  type UpdateFrequency,
  type UpdateNotificationPreference,
  type UpdateChannel,
  DEFAULT_UPDATE_SETTINGS,
} from "@/lib/update/types";
import { checkForUpdates } from "@/lib/update/checker";
import {
  getJsonValue,
  setJsonValue,
} from "@/lib/storage/secure-store";

const STORAGE_KEY = "firepit.update-settings";

const FREQUENCIES: UpdateFrequency[] = [
  "immediate",
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "security_only",
  "never",
];
const NOTIFY_PREFERENCES: UpdateNotificationPreference[] = [
  "all",
  "security_only",
  "none",
];
const CHANNELS: UpdateChannel[] = ["stable", "beta"];

export async function loadUpdateSettings(): Promise<UpdateSettings> {
  const stored = await getJsonValue<UpdateSettings>(STORAGE_KEY);
  if (!stored) return { ...DEFAULT_UPDATE_SETTINGS };
  return {
    ...DEFAULT_UPDATE_SETTINGS,
    ...stored,
    // Reject unknown enum values from stale/corrupt storage
    frequency: FREQUENCIES.includes(stored.frequency)
      ? stored.frequency
      : DEFAULT_UPDATE_SETTINGS.frequency,
    notifyPreference: NOTIFY_PREFERENCES.includes(stored.notifyPreference)
      ? stored.notifyPreference
      : DEFAULT_UPDATE_SETTINGS.notifyPreference,
    channel: CHANNELS.includes(stored.channel)
      ? stored.channel
      : DEFAULT_UPDATE_SETTINGS.channel,
    setupComplete: stored.setupComplete ?? false,
  };
}

export async function saveUpdateSettings(settings: UpdateSettings): Promise<void> {
  await setJsonValue(STORAGE_KEY, settings);
}

export type UpdateServiceState = {
  checking: boolean;
  result: UpdateCheckResult | null;
  showPrompt: boolean;
  settings: UpdateSettings;
};

export type UpdateServiceActions = {
  checkNow: () => Promise<void>;
  dismissPrompt: (skipVersion: boolean) => void;
  showSettings: () => void;
  updateSettings: (partial: Partial<UpdateSettings>) => Promise<void>;
};

/**
 * Run the full update check flow. Called on app startup.
 * Returns the check result and whether the prompt should be shown.
 */
export async function runUpdateCheck(
  settings: UpdateSettings,
): Promise<UpdateCheckResult | null> {
  // Only run on Android
  if (Platform.OS !== "android") return null;

  // If frequency is "never" and user doesn't want notifications, skip
  if (
    settings.frequency === "never" &&
    settings.notifyPreference === "none"
  ) {
    return null;
  }

  try {
    const result = await checkForUpdates(settings);
    return result;
  } catch {
    // Silently fail — don't block the app if the update check fails
    return null;
  }
}

/**
 * Record that the user skipped a version.
 */
export async function skipVersion(
  settings: UpdateSettings,
  version: string,
): Promise<UpdateSettings> {
  const updated: UpdateSettings = {
    ...settings,
    lastSkippedAt: Date.now(),
    lastSkippedVersion: version,
  };
  await saveUpdateSettings(updated);
  return updated;
}

/**
 * Record that we checked for updates.
 */
export async function recordCheck(
  settings: UpdateSettings,
): Promise<UpdateSettings> {
  const updated: UpdateSettings = {
    ...settings,
    lastCheckedAt: Date.now(),
  };
  await saveUpdateSettings(updated);
  return updated;
}


