import { NextResponse } from "next/server";
import { apiCache } from "@/lib/cache-utils";

const REPO_OWNER = "acarlson33";
const REPO_NAME = "firepit";
const CURRENT_VERSION = "1.0.0";
const CACHE_KEY = "github-latest-release";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
}

/**
 * Compare two semantic versions
 * Returns true if version1 is older than version2
 */
function isVersionOutdated(current: string, latest: string): boolean {
	// Remove 'v' prefix if present
	const cleanCurrent = current.replace(/^V/, "");
	const cleanLatest = latest.replace(/^V/, "");

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
	try {
		// Try to get cached version info
		const cachedRelease = await apiCache.dedupe<GitHubRelease>(
			CACHE_KEY,
			fetchLatestRelease,
			CACHE_TTL,
		);

		const latestVersion = cachedRelease.tag_name;
		const isOutdated = isVersionOutdated(CURRENT_VERSION, latestVersion);

		const versionInfo: VersionInfo = {
			currentVersion: CURRENT_VERSION,
			latestVersion,
			isOutdated,
			releaseUrl: cachedRelease.html_url,
			publishedAt: cachedRelease.published_at,
		};

		return NextResponse.json(versionInfo);
	} catch (error) {
		// If GitHub API fails, return current version without comparison
		const versionInfo: VersionInfo = {
			currentVersion: CURRENT_VERSION,
			latestVersion: "unknown",
			isOutdated: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch latest version",
		};

		return NextResponse.json(versionInfo, { status: 200 });
	}
}
