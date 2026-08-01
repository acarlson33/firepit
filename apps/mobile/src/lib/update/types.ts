export type UpdateFrequency =
  | "immediate"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "security_only"
  | "never";

export type UpdateNotificationPreference = "all" | "security_only" | "none";

export type UpdateChannel = "stable" | "beta";

export const UPDATE_FREQUENCY_LABELS = {
  immediate: "Whenever available",
  weekly: "Every week",
  biweekly: "Every two weeks",
  monthly: "Every month",
  bimonthly: "Every two months",
  security_only: "Security only",
  never: "Never",
} satisfies Record<UpdateFrequency, string>;

export const UPDATE_NOTIFICATION_LABELS = {
  all: "All releases",
  security_only: "Security only",
  none: "None",
} satisfies Record<UpdateNotificationPreference, string>;

export const UPDATE_CHANNEL_LABELS = {
  stable: "Stable",
  beta: "Beta",
} satisfies Record<UpdateChannel, string>;

export const UPDATE_FREQUENCY_DAYS = {
  immediate: 0,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
  security_only: -1, // special: only update on security releases
  never: -2, // special: never auto-update
} satisfies Record<UpdateFrequency, number>;

export type UpdateSettings = {
  frequency: UpdateFrequency;
  notifyPreference: UpdateNotificationPreference;
  channel: UpdateChannel;
  // Timestamp (ms) of when we last checked for updates
  lastCheckedAt: number | null;
  // Timestamp (ms) of when we last dismissed/skipped a release
  lastSkippedAt: number | null;
  // The version string of the release that was last skipped
  lastSkippedVersion: string | null;
  // Whether the user has completed the initial setup prompt
  setupComplete: boolean;
};

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  frequency: "weekly",
  notifyPreference: "all",
  channel: "stable",
  lastCheckedAt: null,
  lastSkippedAt: null,
  lastSkippedVersion: null,
  setupComplete: false,
};

export type GitHubRelease = {
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
  htmlUrl: string;
  assets: GitHubReleaseAsset[];
};

export type GitHubReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  size: number;
  contentType: string;
};

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  isSecurity: boolean;
  prerelease: string | null;
  prereleaseIdentifiers: Array<number | string>;
  raw: string;
};

export type UpdateCheckResult = {
  hasUpdate: boolean;
  isSecurityUpdate: boolean;
  currentVersion: ParsedVersion;
  latestVersion: ParsedVersion;
  release: GitHubRelease | null;
  apkAsset: GitHubReleaseAsset | null;
  shouldAutoInstall: boolean;
  shouldNotify: boolean;
};

export const GITHUB_REPO_OWNER = "firepit-chat";
export const GITHUB_REPO_NAME = "firepit";
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
