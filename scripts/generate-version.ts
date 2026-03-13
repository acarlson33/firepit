#!/usr/bin/env bun
/**
 * Generate version metadata at build time
 * This script captures the current git state and determines the version
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

interface VersionMetadata {
    version: string;
    commitSha: string;
    commitShort: string;
    buildTime: string;
    isCanary: boolean;
    latestTag: string | null;
    branch: string;
}

/**
 * Normalize a version-like string by removing a leading v prefix and
 * stripping prerelease/build metadata for numeric comparison.
 */
function normalizeVersion(raw: string): string {
    return raw.trim().replace(/^v/i, "").split("-")[0].split("+")[0] || "0.0.0";
}

/**
 * Parse a version into numeric parts for comparison (major.minor.patch...).
 */
function parseVersionParts(version: string): number[] {
    return normalizeVersion(version)
        .split(".")
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
}

/**
 * Compare versions.
 * Returns 1 when left > right, -1 when left < right, and 0 when equal.
 */
function compareVersions(left: string, right: string): number {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const width = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < width; index += 1) {
        const leftValue = leftParts[index] ?? 0;
        const rightValue = rightParts[index] ?? 0;

        if (leftValue > rightValue) {
            return 1;
        }
        if (leftValue < rightValue) {
            return -1;
        }
    }

    return 0;
}

/**
 * Get version from package.json as fallback
 */
function getPackageVersion(): string {
    try {
        const packagePath = join(process.cwd(), "package.json");
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
        return packageJson.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}

/**
 * Execute a git command and return the output
 */
function gitCommand(command: string): string {
    try {
        return execSync(command, { encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

/**
 * Generate version metadata from git information
 */
function generateVersionMetadata(): VersionMetadata {
    const packageVersion = getPackageVersion();
    const packageVersionLabel = `v${packageVersion}`;

    // Get current commit SHA
    const commitSha = gitCommand("git rev-parse HEAD") || "unknown";
    const commitShort = commitSha.slice(0, 7);

    // Get current branch
    const branch = gitCommand("git rev-parse --abbrev-ref HEAD") || "unknown";

    // Get the latest tag
    const latestTag = gitCommand("git describe --tags --abbrev=0 2>/dev/null");
    const gitAvailable = commitSha !== "unknown";

    // Determine version and canary status
    let version = packageVersionLabel;
    let isCanary = false;

    if (!gitAvailable || !latestTag) {
        // No git metadata/tag available: assume stable package version.
        version = packageVersionLabel;
        isCanary = false;
    } else {
        const comparison = compareVersions(packageVersion, latestTag);

        if (comparison > 0) {
            // package.json is ahead of git tag: canary build from package version.
            version = `${packageVersionLabel}-canary.${commitShort}`;
            isCanary = true;
        } else {
            // Equal or behind latest git tag: stable build.
            version = latestTag;
            isCanary = false;
        }
    }

    return {
        version,
        commitSha,
        commitShort,
        buildTime: new Date().toISOString(),
        isCanary,
        latestTag: latestTag || null,
        branch,
    };
}

/**
 * Main execution
 */
function main() {
    console.log("🔧 Generating version metadata...");

    const metadata = generateVersionMetadata();

    console.log("📦 Version information:");
    console.log(`   Version: ${metadata.version}`);
    console.log(`   Commit: ${metadata.commitSha}`);
    console.log(`   Branch: ${metadata.branch}`);
    console.log(`   Canary: ${metadata.isCanary}`);
    console.log(`   Build time: ${metadata.buildTime}`);

    // Ensure src/generated directory exists
    const generatedDir = join(process.cwd(), "src", "generated");
    mkdirSync(generatedDir, { recursive: true });

    // Write metadata to file
    const outputPath = join(generatedDir, "version-metadata.json");
    writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

    console.log(`✅ Version metadata written to ${outputPath}`);
}

main();
