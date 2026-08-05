import type { ParsedVersion } from "./types";

/**
 * Parse a version string like "2.1.0", "v2.1.0", "2.1.1s" into components.
 * The "s" suffix indicates a security release.
 * Prerelease identifiers follow SemVer ordering ("2.0.0-canary.10"),
 * and "+build" metadata is stripped before storing or comparing.
 */
export function parseVersion(raw: string): ParsedVersion {
  const cleaned = raw.trim().replace(/^v/, "");

  // Build metadata "+build" never participates in precedence
  let numeric = cleaned;
  const plusIndex = numeric.indexOf("+");
  if (plusIndex !== -1) {
    numeric = numeric.slice(0, plusIndex);
  }

  // The "s" security suffix follows the version (and any build metadata),
  // so it must be detected after the metadata is stripped.
  const isSecurity = numeric.endsWith("s");
  if (isSecurity) {
    numeric = numeric.slice(0, -1);
  }

  // Prerelease suffix like "2.0.0-canary.10"
  const dashIndex = numeric.indexOf("-");
  let prerelease: string | null = null;
  let prereleaseIdentifiers: Array<number | string> = [];
  if (dashIndex !== -1) {
    prerelease = numeric.slice(dashIndex + 1);
    numeric = numeric.slice(0, dashIndex);
    prereleaseIdentifiers = prerelease.split(".").map((part) => {
      const n = Number.parseInt(part, 10);
      return String(n) === part ? n : part;
    });
  }

  const [major = 0, minor = 0, patch = 0] = numeric
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  return {
    major,
    minor,
    patch,
    isSecurity,
    prerelease,
    prereleaseIdentifiers,
    raw: cleaned,
  };
}

function comparePrerelease(
  a: Array<number | string>,
  b: Array<number | string>,
): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    const xIsNum = typeof x === "number";
    const yIsNum = typeof y === "number";
    if (xIsNum && yIsNum) {
      if (x !== y) return x - y;
    } else if (xIsNum !== yIsNum) {
      return xIsNum ? -1 : 1; // numeric identifiers sort before non-numeric
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return a.length - b.length;
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
    return comparePrerelease(a.prereleaseIdentifiers, b.prereleaseIdentifiers);
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
