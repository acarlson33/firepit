/**
 * Tests for /api/direct-messages endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock environment variables
vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
vi.stubEnv("APPWRITE_API_KEY", "test-api-key");
vi.stubEnv("APPWRITE_DATABASE_ID", "test-db");

// Create persistent mocks
const { mockGetServerSession, mockListDocuments, mockCreateDocument, mockUpdateDocument, mockDeleteDocument, mockGetDocument } = vi.hoisted(() => ({
	mockGetServerSession: vi.fn(),
	mockListDocuments: vi.fn(),
	mockCreateDocument: vi.fn(),
	mockUpdateDocument: vi.fn(),
	mockDeleteDocument: vi.fn(),
	mockGetDocument: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			listDocuments: mockListDocuments,
			createDocument: mockCreateDocument,
			updateDocument: mockUpdateDocument,
			deleteDocument: mockDeleteDocument,
			getDocument: mockGetDocument,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			conversations: "conversations-collection",
			directMessages: "direct-messages-collection",
			messageAttachments: "message-attachments-collection",
		},
		teams: {
			adminTeamId: "admin-team",
			moderatorTeamId: "mod-team",
		},
	})),
	getServerClient: vi.fn(() => ({
		databases: {
			listDocuments: mockListDocuments,
			createDocument: mockCreateDocument,
			updateDocument: mockUpdateDocument,
			deleteDocument: mockDeleteDocument,
			getDocument: mockGetDocument,
		},
	})),
	perms: {
		directMessage: vi.fn(() => []),
	},
	UnauthorizedError: class UnauthorizedError extends Error {
		constructor(message = "Unauthorized") {
			super(message);
			this.name = "UnauthorizedError";
		}
	},
}));

vi.mock("@/lib/posthog-utils", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
	recordError: vi.fn(),
	setTransactionName: vi.fn(),
	trackApiCall: vi.fn(),
	trackMessage: vi.fn(),
	addTransactionAttributes: vi.fn(),
}));

vi.mock("@/lib/compression-utils", () => ({
	shouldCompress: vi.fn(() => false),
}));

vi.mock("@/lib/validation", () => ({
	validateBody: vi.fn(() => ({ success: true })),
	directMessageSchema: {},
}));

vi.mock("node-appwrite", () => ({
	ID: {
		unique: () => "mock-id",
	},
	Query: {
		equal: (field: string, value: string | string[]) => `equal(${field},${JSON.stringify(value)})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
		limit: (n: number) => `limit(${n})`,
	},
	Permission: {
		read: (role: string) => `read("${role}")`,
		update: (role: string) => `update("${role}")`,
		delete: (role: string) => `delete("${role}")`,
	},
	Role: {
		user: (id: string) => `user:${id}`,
	},
}));

describe("Direct Messages API", () => {
	let GET: (request: NextRequest) => Promise<Response>;
	let POST: (request: NextRequest) => Promise<Response>;
	let PATCH: (request: NextRequest) => Promise<Response>;
	let DELETE: (request: NextRequest) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handlers
		const module = await import("../../app/api/direct-messages/route");
		GET = module.GET;
		POST = module.POST;
		PATCH = module.PATCH;
		DELETE = module.DELETE;
	});

	describe("GET /api/direct-messages", () => {
		it("should return 401 if not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const url = new URL("http://localhost/api/direct-messages?type=conversations");
			const request = new NextRequest(url);
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should list conversations for authenticated user", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "conv-1",
						participants: ["user-1", "user-2"],
						lastMessageAt: new Date().toISOString(),
						$createdAt: new Date().toISOString(),
					},
					{
						$id: "conv-2",
						participants: ["user-1", "user-3"],
						lastMessageAt: new Date().toISOString(),
						$createdAt: new Date().toISOString(),
					},
				],
			});

			const url = new URL("http://localhost/api/direct-messages?type=conversations");
			const request = new NextRequest(url);
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.conversations).toHaveLength(2);
			expect(data.conversations[0].$id).toBe("conv-1");
		});

		it("should list messages for a conversation", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "msg-1",
						conversationId: "conv-1",
						senderId: "user-1",
						receiverId: "user-2",
						text: "Hello",
						$createdAt: new Date().toISOString(),
					},
					{
						$id: "msg-2",
						conversationId: "conv-1",
						senderId: "user-2",
						receiverId: "user-1",
						text: "Hi there",
						$createdAt: new Date().toISOString(),
					},
				],
				total: 2,
			});

			const url = new URL("http://localhost/api/direct-messages?type=messages&conversationId=conv-1");
			const request = new NextRequest(url);
		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.items).toHaveLength(2);
		expect(data.items[0].conversationId).toBe("conv-1");
		});

		it("should get or create conversation between two users", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			// Mock finding existing conversation
			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "conv-1",
						participants: ["user-1", "user-2"],
						lastMessageAt: new Date().toISOString(),
						$createdAt: new Date().toISOString(),
					},
				],
			});

			const url = new URL("http://localhost/api/direct-messages?type=conversation&userId1=user-1&userId2=user-2");
			const request = new NextRequest(url);
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.conversation.$id).toBe("conv-1");
		});

		it("should create new conversation if not found", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			// Mock no existing conversation
			mockListDocuments.mockResolvedValue({
				documents: [],
			});

			// Mock creating new conversation
			mockCreateDocument.mockResolvedValue({
				$id: "new-conv-1",
				participants: ["user-1", "user-2"],
				lastMessageAt: new Date().toISOString(),
				$createdAt: new Date().toISOString(),
			});

			const url = new URL("http://localhost/api/direct-messages?type=conversation&userId1=user-1&userId2=user-2");
			const request = new NextRequest(url);
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.conversation.$id).toBe("new-conv-1");
			expect(mockCreateDocument).toHaveBeenCalled();
		});
	});

	describe("POST /api/direct-messages", () => {
		it("should return 401 if not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/direct-messages", {
				method: "POST",
				body: JSON.stringify({
					conversationId: "conv-1",
					senderId: "user-1",
					receiverId: "user-2",
					text: "Hello",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should send a direct message", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-1",
				conversationId: "conv-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				$createdAt: new Date().toISOString(),
			});

			mockUpdateDocument.mockResolvedValue({});

			const request = new NextRequest("http://localhost/api/direct-messages", {
				method: "POST",
				body: JSON.stringify({
					conversationId: "conv-1",
					senderId: "user-1",
					receiverId: "user-2",
					text: "Hello",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message.$id).toBe("msg-1");
			expect(data.message.text).toBe("Hello");
		});

		it("should send a direct message with image", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-2",
				conversationId: "conv-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Check this out",
				imageFileId: "file-123",
				imageUrl: "https://example.com/image.jpg",
				$createdAt: new Date().toISOString(),
			});

			mockUpdateDocument.mockResolvedValue({});

			const request = new NextRequest("http://localhost/api/direct-messages", {
				method: "POST",
				body: JSON.stringify({
					conversationId: "conv-1",
					senderId: "user-1",
					receiverId: "user-2",
					text: "Check this out",
					imageFileId: "file-123",
					imageUrl: "https://example.com/image.jpg",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message.imageFileId).toBe("file-123");
			expect(data.message.imageUrl).toBe("https://example.com/image.jpg");
		});

		it("should return 400 if required fields are missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/direct-messages", {
				method: "POST",
				body: JSON.stringify({
					conversationId: "conv-1",
					senderId: "user-1",
					receiverId: "user-2",
					// Missing text, imageFileId, and attachments
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("required");
		});
	});

	describe("PATCH /api/direct-messages", () => {
		it("should return 401 if not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const url = new URL("http://localhost/api/direct-messages?id=msg-1");
			const request = new NextRequest(url, {
				method: "PATCH",
				body: JSON.stringify({ text: "Updated text" }),
			});

			const response = await PATCH(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should edit a direct message", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				conversationId: "conv-1",
				text: "Original text",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				conversationId: "conv-1",
				text: "Updated text",
				editedAt: new Date().toISOString(),
			});

			const url = new URL("http://localhost/api/direct-messages?id=msg-1");
			const request = new NextRequest(url, {
				method: "PATCH",
				body: JSON.stringify({ text: "Updated text" }),
			});

			const response = await PATCH(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message.text).toBe("Updated text");
			expect(mockUpdateDocument).toHaveBeenCalled();
		});

		it("should return 400 if message ID is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const url = new URL("http://localhost/api/direct-messages");
			const request = new NextRequest(url, {
				method: "PATCH",
				body: JSON.stringify({ text: "Updated text" }),
			});

			const response = await PATCH(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("Message ID");
		});
	});

	describe("DELETE /api/direct-messages", () => {
		it("should return 401 if not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const url = new URL("http://localhost/api/direct-messages?id=msg-1");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should delete a direct message", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				conversationId: "conv-1",
				text: "Message to delete",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				removedAt: new Date().toISOString(),
				removedBy: "user-1",
			});

			const url = new URL("http://localhost/api/direct-messages?id=msg-1");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockUpdateDocument).toHaveBeenCalled();
		});

		it("should return 400 if message ID is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const url = new URL("http://localhost/api/direct-messages");
			const request = new NextRequest(url, {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("Message ID");
		});
	});
});
