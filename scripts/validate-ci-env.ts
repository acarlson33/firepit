#!/usr/bin/env bun

/**
 * CI Environment Validation Script
 *
 * Purpose:
 * - Validate required environment variables in CI pipelines (GitHub Actions)
 * - Do NOT rely on .env.local or dotenv loading
 * - Fail fast with actionable messages before build/tests
 */

type CheckResult = {
    ok: boolean;
    errors: string[];
    warnings: string[];
};

function nonEmpty(value: string | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

function looksLikePlaceholder(value: string): boolean {
    const v = value.trim().toLowerCase();
    return (
        v.includes("your-") ||
        v.includes("placeholder") ||
        v === "changeme" ||
        v === "replace-me"
    );
}

function isValidEndpoint(value: string): boolean {
    try {
        const parsed = new URL(value);
        const validProtocol =
            parsed.protocol === "https:" || parsed.protocol === "http:";
        return validProtocol && value.endsWith("/v1");
    } catch {
        return false;
    }
}

function mask(value: string): string {
    if (value.length < 8) {
        return "***";
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function validate(): CheckResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    const publicEndpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const publicProjectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

    if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
        errors.push("Missing APPWRITE_ENDPOINT");
    } else {
        const endpointValue = endpoint;
        if (looksLikePlaceholder(endpointValue)) {
            errors.push("APPWRITE_ENDPOINT appears to be a placeholder");
        } else if (!isValidEndpoint(endpointValue)) {
            errors.push("APPWRITE_ENDPOINT must be a valid URL ending in /v1");
        }
    }

    if (typeof projectId !== "string" || projectId.trim().length === 0) {
        errors.push("Missing APPWRITE_PROJECT_ID");
    } else {
        const projectIdValue = projectId;
        if (looksLikePlaceholder(projectIdValue)) {
            errors.push("APPWRITE_PROJECT_ID appears to be a placeholder");
        }
    }

    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        errors.push("Missing APPWRITE_API_KEY");
    } else {
        const apiKeyValue = apiKey;
        if (looksLikePlaceholder(apiKeyValue)) {
            errors.push("APPWRITE_API_KEY appears to be a placeholder");
        } else if (apiKeyValue.trim().length < 20) {
            errors.push("APPWRITE_API_KEY appears too short");
        }
    }

    if (!nonEmpty(publicEndpoint)) {
        warnings.push(
            "NEXT_PUBLIC_APPWRITE_ENDPOINT is not set (recommended in CI)",
        );
    } else if (endpoint && publicEndpoint !== endpoint) {
        warnings.push(
            "NEXT_PUBLIC_APPWRITE_ENDPOINT differs from APPWRITE_ENDPOINT",
        );
    }

    if (!nonEmpty(publicProjectId)) {
        warnings.push(
            "NEXT_PUBLIC_APPWRITE_PROJECT_ID is not set (recommended in CI)",
        );
    } else if (projectId && publicProjectId !== projectId) {
        warnings.push(
            "NEXT_PUBLIC_APPWRITE_PROJECT_ID differs from APPWRITE_PROJECT_ID",
        );
    }

    if (process.env.GITHUB_ACTIONS !== "true") {
        warnings.push(
            "GITHUB_ACTIONS is not true; validate-env:ci is intended for CI environments",
        );
    }

    return { ok: errors.length === 0, errors, warnings };
}

function main() {
    const result = validate();

    console.log(
        "🔎 Validating CI environment variables (no .env.local lookup)",
    );

    if (nonEmpty(process.env.APPWRITE_ENDPOINT)) {
        console.log(`✓ APPWRITE_ENDPOINT: ${process.env.APPWRITE_ENDPOINT}`);
    }
    if (nonEmpty(process.env.APPWRITE_PROJECT_ID)) {
        console.log(
            `✓ APPWRITE_PROJECT_ID: ${process.env.APPWRITE_PROJECT_ID}`,
        );
    }
    if (nonEmpty(process.env.APPWRITE_API_KEY)) {
        console.log(
            `✓ APPWRITE_API_KEY: ${mask(process.env.APPWRITE_API_KEY as string)}`,
        );
    }

    for (const warning of result.warnings) {
        console.warn(`⚠ ${warning}`);
    }

    if (!result.ok) {
        console.error("\n❌ CI environment validation failed:");
        for (const error of result.errors) {
            console.error(`  - ${error}`);
        }
        console.error(
            "\nEnsure GitHub repository secrets are configured: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY",
        );
        process.exit(1);
    }

    console.log("✅ CI environment validation passed");
}

main();
