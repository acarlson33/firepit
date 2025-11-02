/**
 * Tests for POST /api/profiles/batch endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/profiles/batch/route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/appwrite-profiles", () => ({
	getUserProfile: vi.fn(),
	getAvatarUrl: vi.fn(),
}));

vi.mock("@/lib/appwrite-status", () => ({
	getUserStatus: vi.fn(),
}));

vi.mock("@/lib/newrelic-utils", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
	recordError: vi.fn(),
	setTransactionName: vi.fn(),
	trackApiCall: vi.fn(),
	addTransactionAttributes: vi.fn(),
}));

import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";

describe("POST /api/profiles/batch", () => {
	let mockGetUserProfile: any;
	let mockGetUserStatus: any;
	let mockGetAvatarUrl: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		const profiles = await import("@/lib/appwrite-profiles");
		const status = await import("@/lib/appwrite-status");
		mockGetUserProfile = profiles.getUserProfile;
		mockGetUserStatus = status.getUserStatus;
		mockGetAvatarUrl = profiles.getAvatarUrl;
		mockGetAvatarUrl.mockReturnValue("https://example.com/avatar.png");
	});

	const createRequest = (body: unknown) => {
		return new NextRequest("http://localhost:3000/api/profiles/batch", {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		});
	};

	it("should return 400 when userIds is not an array", async () => {
		const request = createRequest({ userIds: "not-an-array" });

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("userIds array is required");
	});

	it("should return 400 when userIds is empty", async () => {
		const request = createRequest({ userIds: [] });

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("userIds array is required");
	});

	it("should return 400 when userIds exceeds 100 items", async () => {
		const userIds = Array.from({ length: 101 }, (_, i) => `user${i}`);
		const request = createRequest({ userIds });

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("Maximum 100 userIds per request");
	});

	it("should fetch profiles for valid userIds", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: "they/them",
			location: "Test City",
			website: "https://test.com",
			avatarFileId: "avatar123",
		});
		mockGetUserStatus.mockResolvedValue({
			status: "online",
			customMessage: "Working",
			lastSeenAt: "2024-01-01T00:00:00.000Z",
		});

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles.user1).toBeDefined();
		expect(data.profiles.user1.displayName).toBe("Test User");
		expect(data.profiles.user1.bio).toBe("Test bio");
		expect(data.profiles.user1.status?.status).toBe("online");
	});

	it("should deduplicate userIds", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
		});
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({
			userIds: ["user1", "user1", "user1"],
		});
		await POST(request);

		// Should only call getUserProfile once despite 3 duplicate IDs
		expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
	});

	it("should handle multiple users in parallel", async () => {
		mockGetUserProfile
			.mockResolvedValueOnce({
				userId: "user1",
				displayName: "User 1",
			})
			.mockResolvedValueOnce({
				userId: "user2",
				displayName: "User 2",
			});
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1", "user2"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles.user1).toBeDefined();
		expect(data.profiles.user2).toBeDefined();
		expect(mockGetUserProfile).toHaveBeenCalledTimes(2);
	});

	it("should handle missing profiles gracefully", async () => {
		mockGetUserProfile.mockRejectedValue(new Error("Profile not found"));
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles.user1).toBeUndefined();
	});

	it("should handle missing status gracefully", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
		});
		mockGetUserStatus.mockRejectedValue(new Error("Status not found"));

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles.user1).toBeDefined();
		expect(data.profiles.user1.status).toBeUndefined();
	});

	it("should include avatarUrl when avatarFileId exists", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
			avatarFileId: "avatar123",
		});
		mockGetUserStatus.mockResolvedValue(null);
		mockGetAvatarUrl.mockReturnValue(
			"https://example.com/avatar/avatar123.png"
		);

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		expect(data.profiles.user1.avatarUrl).toBe(
			"https://example.com/avatar/avatar123.png"
		);
		expect(mockGetAvatarUrl).toHaveBeenCalledWith("avatar123");
	});

	it("should not include avatarUrl when avatarFileId is missing", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
			avatarFileId: undefined,
		});
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		expect(data.profiles.user1.avatarUrl).toBeUndefined();
		expect(mockGetAvatarUrl).not.toHaveBeenCalled();
	});

	it("should include all profile fields", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: "they/them",
			location: "Test City",
			website: "https://test.com",
			avatarFileId: "avatar123",
		});
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		const profile = data.profiles.user1;
		expect(profile.userId).toBe("user1");
		expect(profile.displayName).toBe("Test User");
		expect(profile.bio).toBe("Test bio");
		expect(profile.pronouns).toBe("they/them");
		expect(profile.location).toBe("Test City");
		expect(profile.website).toBe("https://test.com");
		expect(profile.avatarFileId).toBe("avatar123");
	});

	it("should include status fields when present", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
		});
		mockGetUserStatus.mockResolvedValue({
			status: "away",
			customMessage: "On break",
			lastSeenAt: "2024-01-01T12:00:00.000Z",
		});

		const request = createRequest({ userIds: ["user1"] });
		const response = await POST(request);
		const data = await response.json();

		const status = data.profiles.user1.status;
		expect(status?.status).toBe("away");
		expect(status?.customMessage).toBe("On break");
		expect(status?.lastSeenAt).toBe("2024-01-01T12:00:00.000Z");
	});

	it("should handle mixed success and failure", async () => {
		mockGetUserProfile
			.mockResolvedValueOnce({
				userId: "user1",
				displayName: "User 1",
			})
			.mockRejectedValueOnce(new Error("Not found"))
			.mockResolvedValueOnce({
				userId: "user3",
				displayName: "User 3",
			});
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1", "user2", "user3"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles.user1).toBeDefined();
		expect(data.profiles.user2).toBeUndefined();
		expect(data.profiles.user3).toBeDefined();
	});

	it("should handle maximum batch size (100 items)", async () => {
		mockGetUserProfile.mockResolvedValue({
			userId: "user1",
			displayName: "Test User",
		});
		mockGetUserStatus.mockResolvedValue(null);

		const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
		const request = createRequest({ userIds });
		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(mockGetUserProfile).toHaveBeenCalledTimes(100);
	});

	it("should handle general errors with 500 status", async () => {
		const request = createRequest({ userIds: ["user1"] });
		// Force a JSON parse error by modifying the request
		vi.spyOn(request, "json").mockRejectedValue(new Error("Parse error"));

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch profiles");
	});

	it("should return empty profiles object when all fetches fail", async () => {
		mockGetUserProfile.mockRejectedValue(new Error("Not found"));
		mockGetUserStatus.mockResolvedValue(null);

		const request = createRequest({ userIds: ["user1", "user2"] });
		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.profiles).toEqual({});
	});

	it("should handle userIds without body wrapper", async () => {
		const request = createRequest({ wrongField: ["user1"] });

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("userIds array is required");
	});
});
