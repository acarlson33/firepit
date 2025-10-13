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

describe("Messages API Routes", () => {
	beforeEach(() => {
		mockGetServerSession.mockClear();
		mockCreateDocument.mockClear();
	});

	describe("POST /api/messages", () => {
		it("should create a message when authenticated", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockCreateDocument.mockResolvedValue({
				$id: "msg-1",
				userId: "user-1",
				userName: "Test User",
				text: "Hello",
				channelId: "channel-1",
				serverId: "server-1",
				$createdAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "Hello",
					channelId: "channel-1",
					serverId: "server-1",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBeDefined();
			expect(data.message.$id).toBe("msg-1");
			expect(data.message.text).toBe("Hello");
			expect(mockCreateDocument).toHaveBeenCalled();
		});		it("should return 401 if not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "Hello",
					channelId: "channel-1",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should return 400 if text is missing", async () => {
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
			expect(data.error).toBe("text and channelId are required");
		});

		it("should return 400 if channelId is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/messages", {
				method: "POST",
				body: JSON.stringify({
					text: "Hello",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("text and channelId are required");
		});
	});
});
