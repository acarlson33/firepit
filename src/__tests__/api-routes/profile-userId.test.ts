/**
 * Tests for GET /api/profile/[userId] endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/profile/[userId]/route";

// Mock dependencies
vi.mock("@/lib/appwrite-profiles", () => ({
	getUserProfile: vi.fn(),
	getAvatarUrl: vi.fn((fileId) => `https://example.com/avatar/${fileId}`),
}));

vi.mock("@/lib/appwrite-status", () => ({
	getUserStatus: vi.fn(),
}));

import { getUserProfile } from "@/lib/appwrite-profiles";
import { getUserStatus } from "@/lib/appwrite-status";

describe("GET /api/profile/[userId]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return 400 if userId is missing", async () => {
		const params = Promise.resolve({ userId: "" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("User ID is required");
	});

	it("should return 404 if profile not found", async () => {
		vi.mocked(getUserProfile).mockResolvedValue(null);
		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Profile not found");
	});

	it("should fetch profile with avatar and status", async () => {
		const mockProfile = {
			userId: "user123",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: "they/them",
			location: "Test City",
			website: "https://test.com",
			avatarFileId: "avatar123",
		};

		const mockStatus = {
			userId: "user123",
			status: "online" as const,
			customMessage: "Working on tests",
			lastSeenAt: "2024-01-01T00:00:00.000Z",
		};

		vi.mocked(getUserProfile).mockResolvedValue(mockProfile);
		vi.mocked(getUserStatus).mockResolvedValue(mockStatus);

		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.userId).toBe("user123");
		expect(data.displayName).toBe("Test User");
		expect(data.bio).toBe("Test bio");
		expect(data.pronouns).toBe("they/them");
		expect(data.location).toBe("Test City");
		expect(data.website).toBe("https://test.com");
		expect(data.avatarFileId).toBe("avatar123");
		expect(data.avatarUrl).toBe("https://example.com/avatar/avatar123");
		expect(data.status).toEqual({
			status: "online",
			customMessage: "Working on tests",
			lastSeenAt: "2024-01-01T00:00:00.000Z",
		});
	});

	it("should handle profile without avatar", async () => {
		const mockProfile = {
			userId: "user123",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: null,
			location: null,
			website: null,
			avatarFileId: null,
		};

		vi.mocked(getUserProfile).mockResolvedValue(mockProfile);
		vi.mocked(getUserStatus).mockResolvedValue(null);

		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.avatarUrl).toBeUndefined();
		expect(data.avatarFileId).toBeNull();
	});

	it("should handle profile without status", async () => {
		const mockProfile = {
			userId: "user123",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: null,
			location: null,
			website: null,
			avatarFileId: null,
		};

		vi.mocked(getUserProfile).mockResolvedValue(mockProfile);
		vi.mocked(getUserStatus).mockResolvedValue(null);

		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.status).toBeUndefined();
	});

	it("should handle errors gracefully", async () => {
		vi.mocked(getUserProfile).mockRejectedValue(new Error("Database error"));

		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch profile");
	});

	it("should handle status fetch errors gracefully", async () => {
		const mockProfile = {
			userId: "user123",
			displayName: "Test User",
			bio: "Test bio",
			pronouns: null,
			location: null,
			website: null,
			avatarFileId: null,
		};

		vi.mocked(getUserProfile).mockResolvedValue(mockProfile);
		vi.mocked(getUserStatus).mockRejectedValue(new Error("Status error"));

		const params = Promise.resolve({ userId: "user123" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		// Should still return 500 since status fetch failed
		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch profile");
	});

	it("should return all profile fields correctly", async () => {
		const mockProfile = {
			userId: "user456",
			displayName: "Another User",
			bio: "Another bio",
			pronouns: "she/her",
			location: "Another City",
			website: "https://another.com",
			avatarFileId: "avatar456",
		};

		const mockStatus = {
			userId: "user456",
			status: "away" as const,
			customMessage: null,
			lastSeenAt: "2024-01-02T00:00:00.000Z",
		};

		vi.mocked(getUserProfile).mockResolvedValue(mockProfile);
		vi.mocked(getUserStatus).mockResolvedValue(mockStatus);

		const params = Promise.resolve({ userId: "user456" });

		const response = await GET({} as Request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			userId: "user456",
			displayName: "Another User",
			bio: "Another bio",
			pronouns: "she/her",
			location: "Another City",
			website: "https://another.com",
			avatarFileId: "avatar456",
			avatarUrl: "https://example.com/avatar/avatar456",
			status: {
				status: "away",
				customMessage: null,
				lastSeenAt: "2024-01-02T00:00:00.000Z",
			},
		});
	});
});
