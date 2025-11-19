import { NextResponse } from "next/server";
import { apiCache } from "@/lib/cache-utils";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_OWNER = "acarlson33";
const REPO_NAME = "firepit";
const CACHE_KEY = "github-latest-release";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface BuildMetadata {
	version: string;
	commitSha: string;
	commitShort: string;
	buildTime: string;
	isCanary: boolean;
	latestTag: string | null;
	branch: string;
}

/**
 * Load build-time version metadata
 * Falls back to default values if file doesn't exist (e.g., in development)
 */
function loadBuildMetadata(): BuildMetadata {
	// Allow tests to inject mock metadata via environment variable
	if (process.env.MOCK_VERSION_METADATA) {
		try {
			return JSON.parse(process.env.MOCK_VERSION_METADATA);
		} catch {
			// If parsing fails, fall through to normal behavior
		}
	}

	try {
		const metadataPath = join(process.cwd(), "src", "generated", "version-metadata.json");
		const content = readFileSync(metadataPath, "utf8");
		return JSON.parse(content);
	} catch {
		// Fallback for development or when metadata hasn't been generated
		return {
			version: "1.0.0-dev",
			commitSha: "unknown",
			commitShort: "unknown",
			buildTime: new Date().toISOString(),
			isCanary: true,
			latestTag: null,
			branch: "unknown",
		};
	}
}

interface GitHubRelease {
	tag_name: string;
	name: string;
	published_at: string;
	html_url: string;
}

interface VersionInfo {
	currentVersion: string;
	latestVersion: string;
	isOutdated: boolean;
	releaseUrl?: string;
	publishedAt?: string;
	error?: string;
	commitSha?: string;
	commitShort?: string;
	buildTime?: string;
	isCanary?: boolean;
	branch?: string;
}

/**
 * Compare two semantic versions
 * Returns true if version1 is older than version2
 */
function isVersionOutdated(current: string, latest: string): boolean {
	// Remove 'v' prefix if present
	const cleanCurrent = current.replace(/^v/i, "");
	const cleanLatest = latest.replace(/^v/i, "");

	const currentParts = cleanCurrent.split(".").map(Number);
	const latestParts = cleanLatest.split(".").map(Number);

	for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
		const currentPart = currentParts[i] || 0;
		const latestPart = latestParts[i] || 0;

		if (latestPart > currentPart) {
			return true;
		}
		if (latestPart < currentPart) {
			return false;
		}
	}

	return false;
}

/**
 * Fetch the latest release from GitHub
 */
async function fetchLatestRelease(): Promise<GitHubRelease> {
	const response = await fetch(
		`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
		{
			headers: {
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "Firepit-App",
			},
			// Don't cache on fetch level since we're using our own cache
			cache: "no-store",
		},
	);

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	return response.json();
}

/**
 * Get version information with caching
 */
export async function GET() {
	// Load build metadata
	const buildMetadata = loadBuildMetadata();

	try {
		// Try to get cached version info
		const cachedRelease = await apiCache.dedupe<GitHubRelease>(
			CACHE_KEY,
			fetchLatestRelease,
			CACHE_TTL,
		);

		const latestVersion = cachedRelease.tag_name;
		const isOutdated = isVersionOutdated(buildMetadata.version, latestVersion);

		const versionInfo: VersionInfo = {
			currentVersion: buildMetadata.version,
			latestVersion,
			isOutdated,
			releaseUrl: cachedRelease.html_url,
			publishedAt: cachedRelease.published_at,
			commitSha: buildMetadata.commitSha,
			commitShort: buildMetadata.commitShort,
			buildTime: buildMetadata.buildTime,
			isCanary: buildMetadata.isCanary,
			branch: buildMetadata.branch,
		};

		return NextResponse.json(versionInfo);
	} catch (error) {
		// If GitHub API fails, return current version without comparison
		const versionInfo: VersionInfo = {
			currentVersion: buildMetadata.version,
			latestVersion: "unknown",
			isOutdated: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch latest version",
			commitSha: buildMetadata.commitSha,
			commitShort: buildMetadata.commitShort,
			buildTime: buildMetadata.buildTime,
			isCanary: buildMetadata.isCanary,
			branch: buildMetadata.branch,
		};

		return NextResponse.json(versionInfo, { status: 200 });
	}
}
