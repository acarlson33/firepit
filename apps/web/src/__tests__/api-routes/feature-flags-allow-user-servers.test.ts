import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/feature-flags/allow-user-servers/route";
import * as featureFlags from "@/lib/feature-flags";

// Mock modules
vi.mock("@/lib/feature-flags");

describe("GET /api/feature-flags/allow-user-servers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return enabled: true when feature flag is enabled", async () => {
		vi.mocked(featureFlags.getFeatureFlag).mockResolvedValue(true as never);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.enabled).toBe(true);
		expect(featureFlags.getFeatureFlag).toHaveBeenCalledWith(
			featureFlags.FEATURE_FLAGS.ALLOW_USER_SERVERS
		);
	});

	it("should return enabled: false when feature flag is disabled", async () => {
		vi.mocked(featureFlags.getFeatureFlag).mockResolvedValue(false as never);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.enabled).toBe(false);
	});

	it("should return enabled: false on error", async () => {
		vi.mocked(featureFlags.getFeatureFlag).mockRejectedValue(
			new Error("Database connection failed")
		);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.enabled).toBe(false);
	});

	it("should handle non-Error exceptions", async () => {
		vi.mocked(featureFlags.getFeatureFlag).mockRejectedValue("Unknown error");

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.enabled).toBe(false);
	});

	it("should handle null/undefined return values", async () => {
		vi.mocked(featureFlags.getFeatureFlag).mockResolvedValue(null as never);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.enabled).toBe(null);
	});	it("should always return 200 status regardless of error", async () => {
		// Test multiple error scenarios
		const errorScenarios = [
			new Error("Network timeout"),
			new Error("Permission denied"),
			"String error",
			{ message: "Object error" },
		];

		for (const error of errorScenarios) {
			vi.mocked(featureFlags.getFeatureFlag).mockRejectedValue(error);

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.enabled).toBe(false);
		}
	});

	it("should return exact values from getFeatureFlag", async () => {
		const testCases = [
			{ value: true, expected: true },
			{ value: false, expected: false },
			{ value: 1, expected: 1 },
			{ value: 0, expected: 0 },
			{ value: "true", expected: "true" },
			{ value: "", expected: "" },
		];

		for (const { value, expected } of testCases) {
			vi.mocked(featureFlags.getFeatureFlag).mockResolvedValue(value as never);

			const response = await GET();
			const data = await response.json();

			expect(data.enabled).toBe(expected);
		}
	});
});
