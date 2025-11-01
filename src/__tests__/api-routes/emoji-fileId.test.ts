/**
 * Tests for GET /api/emoji/[fileId] endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/emoji/[fileId]/route";

// Create mock storage functions
const mockGetFileView = vi.fn();
const mockGetFile = vi.fn();

// Mock dependencies
vi.mock("@/lib/appwrite-admin", () => ({
	getAdminClient: vi.fn(() => ({
		storage: {
			getFileView: mockGetFileView,
			getFile: mockGetFile,
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

describe("GET /api/emoji/[fileId]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return emoji file with correct headers", async () => {
		const mockBuffer = Buffer.from("fake-image-data");
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: "image/png",
		});

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=31536000, immutable"
		);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("should call storage methods with correct bucket and fileId", async () => {
		const mockBuffer = Buffer.from("fake-image-data");
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: "image/gif",
		});

		const context = {
			params: Promise.resolve({ fileId: "test-file-id" }),
		};

		await GET({} as Request, context);

		expect(mockGetFileView).toHaveBeenCalledWith(
			"emojis-bucket",
			"test-file-id"
		);
		expect(mockGetFile).toHaveBeenCalledWith(
			"emojis-bucket",
			"test-file-id"
		);
	});

	it("should return 400 when fileId is missing", async () => {
		const context = {
			params: Promise.resolve({ fileId: "" }),
		};

		const response = await GET({} as Request, context);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("File ID is required");
	});

	it("should handle different mime types", async () => {
		const mockBuffer = Buffer.from("fake-image-data");
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: "image/gif",
		});

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);

		expect(response.headers.get("Content-Type")).toBe("image/gif");
	});

	it("should default to image/png when mimeType is missing", async () => {
		const mockBuffer = Buffer.from("fake-image-data");
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: null,
		});

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);

		expect(response.headers.get("Content-Type")).toBe("image/png");
	});

	it("should handle storage errors gracefully", async () => {
		mockGetFileView.mockRejectedValue(new Error("Storage unavailable"));

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch emoji");
	});

	it("should handle non-Error exceptions", async () => {
		mockGetFileView.mockRejectedValue("Unknown error");

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch emoji");
	});

	it("should handle file not found errors", async () => {
		mockGetFileView.mockRejectedValue(new Error("File not found"));

		const context = {
			params: Promise.resolve({ fileId: "nonexistent" }),
		};

		const response = await GET({} as Request, context);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch emoji");
	});

	it("should return file buffer in response body", async () => {
		const testData = "test-image-data";
		const mockBuffer = Buffer.from(testData);
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: "image/png",
		});

		const context = {
			params: Promise.resolve({ fileId: "emoji123" }),
		};

		const response = await GET({} as Request, context);
		const responseText = await response.text();

		expect(responseText).toBe(testData);
	});

	it("should handle special characters in fileId", async () => {
		const mockBuffer = Buffer.from("fake-image-data");
		mockGetFileView.mockResolvedValue(mockBuffer);
		mockGetFile.mockResolvedValue({
			mimeType: "image/png",
		});

		const context = {
			params: Promise.resolve({ fileId: "emoji-123_test" }),
		};

		const response = await GET({} as Request, context);

		expect(response.status).toBe(200);
		expect(mockGetFileView).toHaveBeenCalledWith(
			"emojis-bucket",
			"emoji-123_test"
		);
	});
});
