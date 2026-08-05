import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_NAME,
  type GitHubRelease,
  type GitHubReleaseAsset,
  type UpdateChannel,
} from "./types";
import type { CpuArch } from "../cpu-arch";
import { compareVersions, parseVersion } from "./version";

/**
 * Fetch all releases from the GitHub API.
 */
export async function fetchReleases(
  channel: UpdateChannel = "stable",
): Promise<GitHubRelease[]> {
  const url = `${GITHUB_RELEASES_URL}?per_page=100`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Firepit/2.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        "GitHub API rate limit reached. Try again later.",
      );
    }
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub releases fetch failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;
  const releases: GitHubRelease[] = data.map((r) => ({
    tagName: String(r.tag_name ?? r.tagName ?? ""),
    name: String(r.name ?? ""),
    body: String(r.body ?? ""),
    publishedAt: String(r.published_at ?? ""),
    prerelease: Boolean(r.prerelease),
    draft: Boolean(r.draft),
    htmlUrl: String(r.html_url ?? ""),
    assets: Array.isArray(r.assets)
      ? (r.assets as Array<Record<string, unknown>>).map((a) => ({
          name: String(a.name ?? ""),
          browserDownloadUrl: String(a.browser_download_url ?? ""),
          size: Number(a.size ?? 0),
          contentType: String(a.content_type ?? ""),
        }))
      : [],
  }));

  // Filter by channel: stable excludes prereleases
  const filtered = releases.filter((r) => {
    if (r.draft) return false;
    if (channel === "stable" && r.prerelease) return false;
    return true;
  });

  return filtered;
}

/**
 * Find the APK asset for Android from a release that matches the device arch.
 * Falls back to universal APK if no arch-specific match is found.
 */
function findApkAsset(release: GitHubRelease, arch: CpuArch): GitHubReleaseAsset | null {
  const apkAssets = release.assets.filter((a) => a.name.endsWith(".apk"));

  const archSuffix = `-${arch}.apk`;
  const archMatch = apkAssets.find((a) => a.name.endsWith(archSuffix));
  if (archMatch) return archMatch;

  const universalMatch = apkAssets.find((a) => a.name.endsWith("-universal.apk"));
  if (universalMatch) return universalMatch;

  return apkAssets[0] ?? null;
}

/**
 * Get the latest release that has an APK asset matching the device arch, filtered by channel.
 */
export async function getLatestReleaseWithApk(
  channel: UpdateChannel = "stable",
  arch: CpuArch = "universal",
): Promise<{ release: GitHubRelease; apk: GitHubReleaseAsset } | null> {
  const releases = await fetchReleases(channel);

  // GitHub returns releases newest-first by creation date; sort by version so
  // ordering is deterministic regardless of API behavior.
  const sorted = [...releases].sort((a, b) =>
    compareVersions(parseVersion(b.tagName), parseVersion(a.tagName)),
  );

  for (const release of sorted) {
    const apk = findApkAsset(release, arch);
    if (apk) {
      return { release, apk };
    }
  }

  return null;
}

/**
 * Extract a short changelog from the release body.
 * Takes the first ~500 characters, stopping at a double newline boundary.
 * `truncated` is true when the body was longer than the excerpt.
 */
export function extractChangelog(
  body: string,
  maxLength = 500,
): { text: string; truncated: boolean } {
  if (!body) return { text: "No changelog available.", truncated: false };

  const cleaned = body
    .replace(/^#{1,3}\s+/gm, "") // strip markdown headings
    .replace(/\r\n/g, "\n")
    .trim();

  if (cleaned.length <= maxLength) {
    return { text: cleaned, truncated: false };
  }

  // Find the last double-newline before maxLength
  const truncated = cleaned.slice(0, maxLength);
  const lastBreak = truncated.lastIndexOf("\n\n");
  if (lastBreak > maxLength * 0.4) {
    return { text: truncated.slice(0, lastBreak) + "\n…", truncated: true };
  }

  // Fall back to last single newline
  const lastSingle = truncated.lastIndexOf("\n");
  if (lastSingle > maxLength * 0.5) {
    return { text: truncated.slice(0, lastSingle) + "\n…", truncated: true };
  }

  return { text: truncated + "…", truncated: true };
}
