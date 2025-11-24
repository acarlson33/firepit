/**
 * Tests for /api/messages/[messageId]/reactions endpoints
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create persistent mocks
const { mockGetDocument, mockUpdateDocument, mockGetServerSession } = vi.hoisted(() => ({
	mockGetDocument: vi.fn(),
	mockUpdateDocument: vi.fn(),
	mockGetServerSession: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			getDocument: mockGetDocument,
			updateDocument: mockUpdateDocument,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			messages: "messages-collection",
		},
	})),
}));

// Mock New Relic utilities
vi.mock("@/lib/posthog-utils", () => ({
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

describe("Message Reactions API", () => {
	let POST: (request: NextRequest, context: any) => Promise<Response>;
	let DELETE: (request: NextRequest, context: any) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handlers
		const module = await import("../../app/api/messages/[messageId]/reactions/route");
		POST = module.POST;
		DELETE = module.DELETE;
	});

	describe("POST /api/messages/[messageId]/reactions", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should return 400 if emoji is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("emoji");
		});

		it("should add a new reaction", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: "[]",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockUpdateDocument).toHaveBeenCalledWith(
				"test-db",
				"messages-collection",
				"msg-1",
				expect.objectContaining({
					reactions: expect.stringContaining("👍"),
				})
			);
		});

		it("should increment existing reaction count", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-2",
				name: "User Two",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1", "user-2"],
						count: 2,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it("should handle custom emoji reactions", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: "[]",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: ":custom-emoji:",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: ":custom-emoji:" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe("DELETE /api/messages/[messageId]/reactions", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions", {
				method: "DELETE",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await DELETE(request, context);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should remove a reaction", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-2",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-2"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
				method: "DELETE",
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await DELETE(request, context);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});		it("should remove entire reaction when count reaches 0", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
				method: "DELETE",
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await DELETE(request, context);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it("should return 404 if reaction not found", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				text: "Hello",
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
				method: "DELETE",
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await DELETE(request, context);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toContain("not found");
		});
	});
});
