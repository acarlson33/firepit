/**
 * Tests for version API route
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/version/route";
import { apiCache } from "@/lib/cache-utils";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Version API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiCache.clear();
	});

	afterEach(() => {
		apiCache.clear();
	});

	it("should return version info when GitHub API succeeds", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v1.1.0",
				name: "Release 1.1.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v1.1.0",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data).toEqual({
			currentVersion: "1.0.0",
			latestVersion: "v1.1.0",
			isOutdated: true,
			releaseUrl: "https://github.com/acarlson33/firepit/releases/tag/v1.1.0",
			publishedAt: "2024-01-01T00:00:00Z",
		});
	});

	it("should return isOutdated false when current version is latest", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v1.0.0",
				name: "Release 1.0.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v1.0.0",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data.isOutdated).toBe(false);
		expect(data.currentVersion).toBe("1.0.0");
		expect(data.latestVersion).toBe("v1.0.0");
	});

	it("should handle GitHub API errors gracefully", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 404,
		});

		const response = await GET();
		const data = await response.json();

		expect(data).toEqual({
			currentVersion: "1.0.0",
			latestVersion: "unknown",
			isOutdated: false,
			error: "GitHub API error: 404",
		});
	});

	it("should handle network errors gracefully", async () => {
		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		const response = await GET();
		const data = await response.json();

		expect(data).toEqual({
			currentVersion: "1.0.0",
			latestVersion: "unknown",
			isOutdated: false,
			error: "Network error",
		});
	});

	it("should use cached data on subsequent requests", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v1.1.0",
				name: "Release 1.1.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v1.1.0",
			}),
		});

		// First request
		await GET();

		// Second request should use cache
		const response = await GET();
		const data = await response.json();

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(data.latestVersion).toBe("v1.1.0");
	});

	it("should compare versions correctly with v prefix", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v2.0.0",
				name: "Release 2.0.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v2.0.0",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data.isOutdated).toBe(true);
	});

	it("should compare versions correctly without v prefix", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "1.2.0",
				name: "Release 1.2.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/1.2.0",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data.isOutdated).toBe(true);
	});

	it("should handle patch version differences", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v1.0.1",
				name: "Release 1.0.1",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v1.0.1",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data.isOutdated).toBe(true);
	});

	it("should return isOutdated false when current version is newer", async () => {
		// Simulate current version being ahead
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				tag_name: "v0.9.0",
				name: "Release 0.9.0",
				published_at: "2024-01-01T00:00:00Z",
				html_url: "https://github.com/acarlson33/firepit/releases/tag/v0.9.0",
			}),
		});

		const response = await GET();
		const data = await response.json();

		expect(data.isOutdated).toBe(false);
	});
});
