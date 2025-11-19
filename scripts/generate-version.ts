#!/usr/bin/env bun
/**
 * Generate version metadata at build time
 * This script captures the current git state and determines the version
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
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
	// Get current commit SHA
	const commitSha = gitCommand("git rev-parse HEAD") || "unknown";
	const commitShort = commitSha.slice(0, 7);

	// Get current branch
	const branch = gitCommand("git rev-parse --abbrev-ref HEAD") || "unknown";

	// Get the latest tag
	const latestTag = gitCommand("git describe --tags --abbrev=0 2>/dev/null");

	// Check if current commit is tagged
	const currentTag = gitCommand(
		"git describe --exact-match --tags HEAD 2>/dev/null",
	);

	// Determine version and canary status
	let version: string;
	let isCanary = false;

	if (currentTag) {
		// Current commit is tagged - use the tag as version
		version = currentTag;
	} else if (latestTag) {
		// Current commit is not tagged - it's a canary build
		version = `${latestTag}-canary.${commitShort}`;
		isCanary = true;
	} else {
		// No tags found - use commit SHA
		version = `0.0.0-canary.${commitShort}`;
		isCanary = true;
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
