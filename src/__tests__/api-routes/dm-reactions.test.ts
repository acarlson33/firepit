/**
 * Tests for /api/direct-messages/[messageId]/reactions endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create persistent mocks
const { mockGetServerSession, mockGetDocument, mockUpdateDocument } = vi.hoisted(() => ({
	mockGetServerSession: vi.fn(),
	mockGetDocument: vi.fn(),
	mockUpdateDocument: vi.fn(),
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
			directMessages: "direct-messages-collection",
		},
	})),
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
	addTransactionAttributes: vi.fn(),
}));

describe("DM Reactions API", () => {
	let POST: (request: NextRequest, context: { params: Promise<{ messageId: string }> }) => Promise<Response>;
	let DELETE: (request: NextRequest, context: { params: Promise<{ messageId: string }> }) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handlers
		const module = await import("../../app/api/direct-messages/[messageId]/reactions/route");
		POST = module.POST;
		DELETE = module.DELETE;
	});

	describe("POST /api/direct-messages/[messageId]/reactions", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toContain("Authentication required");
		});

		it("should return 400 if emoji is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
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

		it("should return 403 if user is not part of conversation", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-3",
				name: "Other User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

	expect(response.status).toBe(403);
	expect(data.error).toBe("Unauthorized");
		});

		it("should add a new reaction", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: "[]",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
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

		it("should increment existing reaction count", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-2",
				name: "Test User 2",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
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
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1", "user-2"],
						count: 2,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
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

		it("should return 400 if user already reacted with same emoji", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions", {
				method: "POST",
				body: JSON.stringify({ emoji: "👍" }),
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await POST(request, context);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("already reacted");
		});
	});

	describe("DELETE /api/direct-messages/[messageId]/reactions", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
				method: "DELETE",
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

			const response = await DELETE(request, context);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toContain("Authentication required");
		});

		it("should remove a reaction", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-1", "user-2"],
						count: 2,
					},
				]),
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "msg-1",
				reactions: JSON.stringify([
					{
						emoji: "👍",
						userIds: ["user-2"],
						count: 1,
					},
				]),
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
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

		it("should remove entire reaction when last user removes", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
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
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
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
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
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

		it("should return 403 if user is not part of conversation", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-3",
				name: "Other User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "msg-1",
				senderId: "user-1",
				receiverId: "user-2",
				text: "Hello",
				reactions: "[]",
			});

			const request = new NextRequest("http://localhost/api/direct-messages/msg-1/reactions?emoji=%F0%9F%91%8D", {
				method: "DELETE",
			});

			const context = {
				params: Promise.resolve({ messageId: "msg-1" }),
			};

		const response = await DELETE(request, context);
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.error).toBe("Not authorized");
		});
	});
});
