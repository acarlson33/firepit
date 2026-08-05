import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getContentUriAsync, readAsStringAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";

import {
  type GitHubRelease,
  type UpdateCheckResult,
  type UpdateNotificationPreference,
  type UpdateSettings,
  UPDATE_FREQUENCY_DAYS,
} from "./types";
import { compareVersions, isSecurityVersion, parseVersion } from "./version";
import { getLatestReleaseWithApk } from "./github";
import { APP_VERSION } from "./constants";
import { getDeviceCpuArch } from "../cpu-arch";

/**
 * Check whether an update should be installed based on the user's
 * frequency preference and the time since the last check/skip.
 */
function isFrequencyDue(
  settings: UpdateSettings,
  release: GitHubRelease,
): boolean {
  const { frequency, lastCheckedAt, lastSkippedAt, lastSkippedVersion } =
    settings;

  // If we already skipped this exact version, don't re-prompt for it —
  // this applies to every frequency, including immediate/security_only.
  if (lastSkippedVersion === release.tagName && lastSkippedAt) {
    return false;
  }

  // Immediate: always update on every check
  if (frequency === "immediate") return true;

  // Never: never auto-install (but may still notify)
  if (frequency === "never") return false;

  // Security only: only auto-install if the release is a security update
  if (frequency === "security_only") {
    return isSecurityVersion(release.tagName);
  }

  const days = UPDATE_FREQUENCY_DAYS[frequency];
  if (days <= 0) return false;

  const msInterval = days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // If we've never checked, or enough time has passed since last check
  if (!lastCheckedAt || now - lastCheckedAt >= msInterval) {
    return true;
  }

  return false;
}

/**
 * Determine if the user should be notified about a release
 * based on their notification preference.
 */
function shouldNotify(
  settings: UpdateSettings,
  isSecurity: boolean,
): boolean {
  const { notifyPreference } = settings;

  if (notifyPreference === "none") return false;
  if (notifyPreference === "all") return true;
  if (notifyPreference === "security_only") return isSecurity;

  return false;
}

/**
 * Main update check. Fetches the latest release, compares to current
 * app version, and returns a result describing what action to take.
 */
export async function checkForUpdates(
  settings: UpdateSettings,
): Promise<UpdateCheckResult> {
  const currentVersion = parseVersion(APP_VERSION);

  // Only check on Android
  if (Platform.OS !== "android") {
    return {
      hasUpdate: false,
      isSecurityUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      release: null,
      apkAsset: null,
      shouldAutoInstall: false,
      shouldNotify: false,
    };
  }

  const latest = await getLatestReleaseWithApk(settings.channel, getDeviceCpuArch());
  if (!latest) {
    return {
      hasUpdate: false,
      isSecurityUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      release: null,
      apkAsset: null,
      shouldAutoInstall: false,
      shouldNotify: false,
    };
  }

  const latestVersion = parseVersion(latest.release.tagName);
  const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;

  if (!hasUpdate) {
    return {
      hasUpdate: false,
      isSecurityUpdate: false,
      currentVersion,
      latestVersion,
      release: null,
      apkAsset: null,
      shouldAutoInstall: false,
      shouldNotify: false,
    };
  }

  const isSecurityUpdate = latestVersion.isSecurity;
  const shouldAutoInstall =
    settings.frequency !== "never" &&
    isFrequencyDue(settings, latest.release);

  const shouldNotifyResult =
    !shouldAutoInstall && shouldNotify(settings, isSecurityUpdate);

  return {
    hasUpdate: true,
    isSecurityUpdate,
    currentVersion,
    latestVersion,
    release: latest.release,
    apkAsset: latest.apk,
    shouldAutoInstall,
    shouldNotify: shouldNotifyResult,
  };
}

/**
 * Download the APK for a release to a temp file.
 * Returns the local file URI.
 */
export async function downloadApk(
  apkUrl: string,
  tagName: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // Ensure URL is absolute — GitHub API sometimes returns relative URLs
  const absoluteUrl = apkUrl.startsWith("http")
    ? apkUrl
    : `https://github.com${apkUrl.startsWith("/") ? "" : "/"}${apkUrl}`;

  const safeTag = tagName.replace(/[^a-zA-Z0-9._-]/g, "_") || "latest";
  const destFile = new FileSystem.File(
    FileSystem.Paths.cache,
    `firepit-update-${safeTag}.apk`,
  );

  // Use the modern File.downloadFileAsync API
  // On Android, this streams directly to the destination file
  // (rejects on non-2xx; no file is left behind on failure)
  const downloadedFile = await FileSystem.File.downloadFileAsync(
    absoluteUrl,
    destFile,
    {
      headers: {
        Accept: "application/vnd.android.package-archive",
      },
      idempotent: true,
    },
  );

  // Validate the result is a real APK (zip magic "PK\x03\x04"), not an
  // HTML error page or truncated download. Reads only the first 4 bytes —
  // File.slice() would build a Blob from an ArrayBuffer, which React
  // Native's Blob polyfill rejects.
  const head = await readAsStringAsync(downloadedFile.uri, {
    encoding: "base64",
    position: 0,
    length: 4,
  });
  if (head !== "UEsDBA==") {
    throw new Error("Downloaded update is not a valid APK file.");
  }

  onProgress?.(1);
  return downloadedFile.uri;
}

/**
 * Launch the Android package installer intent for the downloaded APK.
 * Requires REQUEST_INSTALL_PACKAGES permission.
 */
export async function installApk(apkUri: string): Promise<void> {
  // Convert file:// URI to content:// URI for Android 7+ FileProvider requirement
  const contentUri = await getContentUriAsync(apkUri);
  // Use the Android ACTION_VIEW intent to open the APK with the system installer
  await IntentLauncher.startActivityAsync(
    "android.intent.action.VIEW",
    {
      data: contentUri,
      type: "application/vnd.android.package-archive",
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    },
  );
}

/**
 * Best-effort delete of a downloaded APK file. Never throws.
 */
export async function deleteApk(uri: string): Promise<void> {
  try {
    const file = new FileSystem.File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn("[update] failed to delete apk", error);
  }
}

/**
 * Delete any leftover downloaded APKs in the cache directory so storage
 * doesn't accumulate. Call once at app startup.
 */
export function cleanupDownloadedApks(): void {
  try {
    const cache = new FileSystem.Directory(FileSystem.Paths.cache);
    if (!cache.exists) return;
    for (const entry of cache.list()) {
      if (
        entry instanceof FileSystem.File &&
        entry.name.toLowerCase().endsWith(".apk")
      ) {
        try {
          if (entry.exists) entry.delete();
        } catch (error) {
          console.warn("[update] failed to delete stale apk", error);
        }
      }
    }
  } catch (error) {
    console.warn("[update] failed to scan cache for apks", error);
  }
}

/**
 * Send a local push notification about an available update.
 */
export async function sendUpdateNotification(
  release: GitHubRelease,
  isSecurity: boolean,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: isSecurity
        ? "Security update available"
        : "Firepit update available",
      body: `${release.name} (${release.tagName}) is now available.`,
      data: { type: "update", tagName: release.tagName },
    },
    trigger: null,
  });
}

export { APP_VERSION };
