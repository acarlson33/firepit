import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/messages/route";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
	ID: { unique: () => "mock-id" },
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
	},
}));

// Create persistent mocks using vi.hoisted
const { mockCreateDocument, mockGetServerSession } = vi.hoisted(() => ({
	mockCreateDocument: vi.fn(),
	mockGetServerSession: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			createDocument: mockCreateDocument,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			messages: "messages-collection",
		},
		teams: {
			moderatorTeamId: "mod-team",
			adminTeamId: "admin-team",
		},
	})),
	perms: {
		message: vi.fn(() => ["read(any)", "write(user:test-user)"]),
	},
}));

describe("Messages API Routes - Image Upload", () => {
	beforeEach(() => {
		mockGetServerSession.mockClear();
		mockCreateDocument.mockClear();
	});

	describe("POST /api/messages with image", () => {
		it("should create a message with image when authenticated", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-1",
				userId: "user-1",
				userName: "Test User",
				text: "Check out this image!",
				channelId: "channel-1",
				serverId: "server-1",
				imageFileId: "file-123",
				imageUrl: "https://example.com/image.jpg",
				$createdAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "Check out this image!",
					channelId: "channel-1",
					serverId: "server-1",
					imageFileId: "file-123",
					imageUrl: "https://example.com/image.jpg",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBeDefined();
			expect(data.message.$id).toBe("msg-1");
			expect(data.message.text).toBe("Check out this image!");
			expect(data.message.imageFileId).toBe("file-123");
			expect(data.message.imageUrl).toBe("https://example.com/image.jpg");
			expect(mockCreateDocument).toHaveBeenCalledWith(
				"test-db",
				"messages-collection",
				"mock-id",
				expect.objectContaining({
					userId: "user-1",
					text: "Check out this image!",
					userName: "Test User",
					channelId: "channel-1",
					serverId: "server-1",
					imageFileId: "file-123",
					imageUrl: "https://example.com/image.jpg",
				}),
				expect.any(Array)
			);
		});

		it("should create a message with only image (no text)", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-2",
				userId: "user-1",
				userName: "Test User",
				text: "",
				channelId: "channel-1",
				imageFileId: "file-456",
				imageUrl: "https://example.com/image2.jpg",
				$createdAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "",
					channelId: "channel-1",
					imageFileId: "file-456",
					imageUrl: "https://example.com/image2.jpg",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBeDefined();
			expect(data.message.imageFileId).toBe("file-456");
			expect(data.message.imageUrl).toBe("https://example.com/image2.jpg");
		});

		it("should return 400 if neither text nor imageFileId is provided", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					channelId: "channel-1",
				}),
			});

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("text, imageFileId, or attachments, and channelId are required");
	});

	it("should accept message with text but no image", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-3",
				userId: "user-1",
				userName: "Test User",
				text: "Just text",
				channelId: "channel-1",
				$createdAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "Just text",
					channelId: "channel-1",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBeDefined();
			expect(data.message.text).toBe("Just text");
			expect(data.message.imageFileId).toBeUndefined();
		});

		it("should include imageFileId but not imageUrl if only fileId provided", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-4",
				userId: "user-1",
				userName: "Test User",
				text: "",
				channelId: "channel-1",
				imageFileId: "file-789",
				$createdAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					channelId: "channel-1",
					imageFileId: "file-789",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message.imageFileId).toBe("file-789");
			expect(data.message.imageUrl).toBeUndefined();
		});
	});
});
