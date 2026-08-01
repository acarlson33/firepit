import { ParsedVersion } from "./types";

/**
 * Parse a version string like "2.1.0", "v2.1.0", "2.1.1s" into components.
 * The "s" suffix indicates a security release.
 */
export function parseVersion(raw: string): ParsedVersion {
  const cleaned = raw.trim().replace(/^v/, "");
  const isSecurity = cleaned.endsWith("s");
  let numeric = isSecurity ? cleaned.slice(0, -1) : cleaned;

  // Prerelease suffix like "2.0.0-canary.10"
  const dashIndex = numeric.indexOf("-");
  let prerelease: string | null = null;
  let prereleaseNumber = 0;
  if (dashIndex !== -1) {
    prerelease = numeric.slice(dashIndex + 1);
    numeric = numeric.slice(0, dashIndex);
    const lastSegment = prerelease.split(".").at(-1) ?? "";
    prereleaseNumber = Number.parseInt(lastSegment, 10) || 0;
  }

  const parts = numeric.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    isSecurity,
    prerelease,
    prereleaseNumber,
    raw: cleaned,
  };
}

/**
 * Compare two parsed versions.
 * Returns: negative if a < b, 0 if equal, positive if a > b.
 * Security releases are treated as higher than their non-security counterpart
 * (2.1.1s > 2.1.1) but lower than the next patch (2.1.1s < 2.1.2).
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Same numeric version: security release is "higher" than non-security
  if (a.isSecurity !== b.isSecurity) return a.isSecurity ? 1 : -1;

  // Prerelease: stable (no suffix) is newer than a prerelease of the same version
  if (a.prerelease === null && b.prerelease !== null) return 1;
  if (a.prerelease !== null && b.prerelease === null) return -1;
  if (a.prerelease !== null && b.prerelease !== null) {
    if (a.prereleaseNumber !== b.prereleaseNumber) {
      return a.prereleaseNumber - b.prereleaseNumber;
    }
    return a.prerelease.localeCompare(b.prerelease);
  }
  return 0;
}

export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(parseVersion(current), parseVersion(latest)) < 0;
}

export function isSecurityVersion(version: string): boolean {
  return parseVersion(version).isSecurity;
}

/**
 * Format a version for display (strips the "s" suffix, shows "Security" badge conceptually).
 */
export function formatVersion(version: string): string {
  const parsed = parseVersion(version);
  let result = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  if (parsed.prerelease) {
    result += `-${parsed.prerelease}`;
  }
  if (parsed.isSecurity) {
    result += " (security)";
  }
  return result;
}

// ponytail: self-check runs via `bun src/lib/update/version.ts`, skipped in the app bundle
if (typeof require !== "undefined" && require.main === module) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  assert(compareVersions(parseVersion("2.0.0-canary.10"), parseVersion("2.0.0-canary.11")) < 0, "canary.11 newer than canary.10");
  assert(compareVersions(parseVersion("2.0.0-canary.11"), parseVersion("2.0.0-canary.10")) > 0, "reverse compare");
  assert(compareVersions(parseVersion("2.0.0-canary.10"), parseVersion("2.0.0")) < 0, "stable newer than prerelease");
  assert(compareVersions(parseVersion("2.0.0"), parseVersion("2.0.1")) < 0, "patch compare");
  assert(compareVersions(parseVersion("2.0.0"), parseVersion("2.0.0s")) < 0, "security higher than patch");
  assert(isNewerVersion("2.0.0-canary.10", "2.0.0-canary.11"), "isNewerVersion");
  assert(!isNewerVersion("2.0.0-canary.11", "2.0.0-canary.10"), "not newer when equal or lower");
  console.log("version.ts self-check passed");
}
