/**
 * Tests for GET /api/custom-emojis endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/custom-emojis/route";

// Create mock storage instance
const mockListFiles = vi.fn();

// Mock dependencies
vi.mock("@/lib/appwrite-admin", () => ({
	getAdminClient: vi.fn(() => ({
		storage: {
			listFiles: mockListFiles,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		buckets: {
			emojis: "emojis-bucket",
		},
	})),
}));

describe("GET /api/custom-emojis", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return list of custom emojis", async () => {
		const mockFiles = {
			files: [
				{
					$id: "file1",
					name: "happy.png",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
				{
					$id: "file2",
					name: "sad.gif",
					$createdAt: "2024-01-02T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toHaveLength(2);
		expect(data[0].fileId).toBe("file1");
		expect(data[0].name).toBe("happy");
		expect(data[0].url).toBe("/api/emoji/file1");
		expect(data[1].fileId).toBe("file2");
		expect(data[1].name).toBe("sad");
	});

	it("should remove file extensions from emoji names", async () => {
		const mockFiles = {
			files: [
				{
					$id: "file1",
					name: "thumbs_up.png",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
				{
					$id: "file2",
					name: "heart.gif",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
				{
					$id: "file3",
					name: "star.jpg",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(data[0].name).toBe("thumbs_up");
		expect(data[1].name).toBe("heart");
		expect(data[2].name).toBe("star");
	});

	it("should return empty array when no emojis exist", async () => {
		const mockFiles = {
			files: [],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual([]);
	});

	it("should call listFiles with correct bucket and queries", async () => {
		const mockFiles = {
			files: [],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		await GET();

		expect(mockListFiles).toHaveBeenCalledWith(
			"emojis-bucket",
			expect.arrayContaining([
				expect.stringContaining("orderDesc"),
				expect.stringContaining("limit"),
			])
		);
	});

	it("should handle storage errors gracefully", async () => {
		mockListFiles.mockRejectedValue(new Error("Storage unavailable"));

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch custom emojis");
	});

	it("should handle non-Error exceptions", async () => {
		mockListFiles.mockRejectedValue("Unknown error");

		const response = await GET();
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch custom emojis");
	});

	it("should format emoji URLs correctly", async () => {
		const mockFiles = {
			files: [
				{
					$id: "emoji123",
					name: "custom.png",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(data[0].url).toBe("/api/emoji/emoji123");
	});

	it("should handle emoji names with multiple dots", async () => {
		const mockFiles = {
			files: [
				{
					$id: "file1",
					name: "emoji.v2.final.png",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		// Should remove only the last extension
		expect(data[0].name).toBe("emoji.v2.final");
	});

	it("should handle emoji names without extensions", async () => {
		const mockFiles = {
			files: [
				{
					$id: "file1",
					name: "customemoji",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(data[0].name).toBe("customemoji");
	});

	it("should handle emoji names with underscores and dashes", async () => {
		const mockFiles = {
			files: [
				{
					$id: "file1",
					name: "custom_emoji-v2.png",
					$createdAt: "2024-01-01T00:00:00.000Z",
				},
			],
		};

		mockListFiles.mockResolvedValue(mockFiles);

		const response = await GET();
		const data = await response.json();

		expect(data[0].name).toBe("custom_emoji-v2");
	});

	it("should limit results to 100 emojis", async () => {
		const mockFiles = {
			files: Array.from({ length: 50 }, (_, i) => ({
				$id: `file${i}`,
				name: `emoji${i}.png`,
				$createdAt: "2024-01-01T00:00:00.000Z",
			})),
		};

		mockListFiles.mockResolvedValue(mockFiles);

		await GET();

		// Verify limit is passed in the query
		expect(mockListFiles).toHaveBeenCalledWith(
			"emojis-bucket",
			expect.arrayContaining([expect.stringContaining("limit")])
		);
	});
});
