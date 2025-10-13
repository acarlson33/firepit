import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/users/[userId]/profile/route";

// Mock dependencies
vi.mock("@/lib/appwrite-profiles", () => ({
	getUserProfile: vi.fn(),
	getAvatarUrl: vi.fn((fileId: string) => `http://localhost/avatar/${fileId}`),
}));

vi.mock("@/lib/appwrite-status", () => ({
	getUserStatus: vi.fn(() =>
		Promise.resolve({
			userId: "user-1",
			status: "online",
			customMessage: "",
		}),
	),
}));

describe("User Profile API Route", () => {
	let mockGetUserProfile: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		const profiles = await import("@/lib/appwrite-profiles");
		mockGetUserProfile = profiles.getUserProfile;
	});

	describe("GET /api/users/[userId]/profile", () => {
		it("should return user profile", async () => {
			mockGetUserProfile.mockResolvedValue({
				userId: "user-1",
				displayName: "Alice",
				pronouns: "she/her",
				avatarFileId: "avatar-1",
				avatarUrl: "http://localhost/avatar/avatar-1",
			});

			const request = new NextRequest(
				"http://localhost/api/users/user-1/profile",
			);

			const response = await GET(request, {
				params: Promise.resolve({ userId: "user-1" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.userId).toBe("user-1");
			expect(data.displayName).toBe("Alice");
			expect(data.pronouns).toBe("she/her");
		});

		it("should return 404 if profile not found", async () => {
			mockGetUserProfile.mockResolvedValue(null);

			const request = new NextRequest(
				"http://localhost/api/users/user-999/profile",
			);

			const response = await GET(request, {
				params: Promise.resolve({ userId: "user-999" }),
			});
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe("Profile not found");
		});

		it("should handle database errors", async () => {
			mockGetUserProfile.mockRejectedValue(new Error("Database error"));

			const request = new NextRequest(
				"http://localhost/api/users/user-1/profile",
			);

			const response = await GET(request, {
				params: Promise.resolve({ userId: "user-1" }),
			});

			expect(response.status).toBe(500);
		});
	});
});
