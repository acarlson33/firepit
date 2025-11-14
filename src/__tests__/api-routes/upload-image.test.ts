/**
 * Tests for /api/upload-image endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create persistent mocks
const { mockGetServerSession, mockCreateFile, mockDeleteFile } = vi.hoisted(() => ({
	mockGetServerSession: vi.fn(),
	mockCreateFile: vi.fn(),
	mockDeleteFile: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		storage: {
			createFile: mockCreateFile,
			deleteFile: mockDeleteFile,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		endpoint: "http://localhost/v1",
		project: "test-project",
		buckets: {
			images: "test-bucket",
		},
	})),
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
	recordEvent: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
	ID: {
		unique: () => "mock-file-id",
	},
	Permission: {
		read: (role: string) => `read("${role}")`,
		update: (role: string) => `update("${role}")`,
		delete: (role: string) => `delete("${role}")`,
	},
	Role: {
		user: (id: string) => `user:${id}`,
		any: () => "any",
	},
}));

describe("Upload Image API", () => {
	let POST: (request: NextRequest) => Promise<Response>;
	let DELETE: (request: NextRequest) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handlers
		const module = await import("../../app/api/upload-image/route");
		POST = module.POST;
		DELETE = module.DELETE;
	});

	describe("POST /api/upload-image", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const formData = new FormData();
			const file = new File(["test"], "test.png", { type: "image/png" });
			formData.append("file", file);

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should return 400 if no file is provided", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const formData = new FormData();

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("No file provided");
		});

		it("should return 400 if file is not an image", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const formData = new FormData();
			const file = new File(["test"], "test.txt", { type: "text/plain" });
			formData.append("file", file);

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("Only image files");
		});

		it("should return 400 if file is too large", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const formData = new FormData();
			// Create a file larger than 5MB
			const largeContent = new Array(6 * 1024 * 1024).join("a");
			const file = new File([largeContent], "large.png", { type: "image/png" });
			formData.append("file", file);

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("5MB");
		});

		it("should upload an image successfully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateFile.mockResolvedValue({
				$id: "file-123",
			});

			const formData = new FormData();
			const file = new File(["test image content"], "test.png", { type: "image/png" });
			formData.append("file", file);

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.fileId).toBe("file-123");
			expect(data.url).toContain("file-123");
			expect(mockCreateFile).toHaveBeenCalled();
		});

		it("should handle upload errors gracefully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateFile.mockRejectedValue(new Error("Storage error"));

			const formData = new FormData();
			const file = new File(["test"], "test.png", { type: "image/png" });
			formData.append("file", file);

			const request = new NextRequest("http://localhost/api/upload-image", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Storage error");
		});
	});

	describe("DELETE /api/upload-image", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const url = new URL("http://localhost/api/upload-image?fileId=file-123");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should return 400 if fileId is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const url = new URL("http://localhost/api/upload-image");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("No fileId provided");
		});

		it("should delete an image successfully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockDeleteFile.mockResolvedValue({});

			const url = new URL("http://localhost/api/upload-image?fileId=file-123");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockDeleteFile).toHaveBeenCalledWith("test-bucket", "file-123");
		});

		it("should handle delete errors gracefully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockDeleteFile.mockRejectedValue(new Error("File not found"));

			const url = new URL("http://localhost/api/upload-image?fileId=file-123");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toContain("Failed to delete");
		});
	});
});
