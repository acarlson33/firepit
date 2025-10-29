import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/search/messages/route";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
	Query: {
		search: (field: string, value: string) => `search(${field},${value})`,
		equal: (field: string, value: string) => `equal(${field},${value})`,
		greaterThanEqual: (field: string, value: string) =>
			`greaterThanEqual(${field},${value})`,
		lessThanEqual: (field: string, value: string) =>
			`lessThanEqual(${field},${value})`,
		isNotNull: (field: string) => `isNotNull(${field})`,
		limit: (n: number) => `limit(${n})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
		or: (queries: string[]) => `or([${queries.join(",")}])`,
	},
}));

// Mock databases
const mockDatabases = {
	listDocuments: vi.fn(),
};

// Mock dependencies
vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: mockDatabases,
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			messages: "messages-collection",
			directMessages: "direct-messages-collection",
			profiles: "profiles-collection",
		},
	})),
}));

vi.mock("@/lib/auth-server", () => ({
	getServerSession: vi.fn(() => ({
		$id: "current-user-123",
		name: "Test User",
		email: "test@example.com",
	})),
}));

vi.mock("@/lib/appwrite-profiles", () => ({
	getAvatarUrl: vi.fn((fileId: string) => `http://localhost/avatar/${fileId}`),
}));

vi.mock("@/lib/newrelic-utils", () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
	recordError: vi.fn(),
	setTransactionName: vi.fn(),
	trackApiCall: vi.fn(),
}));

describe("Message Search API Route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /api/search/messages", () => {
		it("should search messages by text", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [
						{
							$id: "msg-1",
							userId: "user-1",
							text: "Hello world",
							$createdAt: "2024-01-01T10:00:00.000Z",
							channelId: "channel-1",
						},
					],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							userId: "user-1",
							displayName: "Alice",
							avatarFileId: "avatar-1",
						},
					],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=hello",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(1);
			expect(data.results[0].type).toBe("channel");
			expect(data.results[0].message.text).toBe("Hello world");
			expect(data.results[0].message.displayName).toBe("Alice");
		});

		it("should search DMs when no channel filter", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							$id: "dm-1",
							conversationId: "conv-1",
							senderId: "user-2",
							receiverId: "current-user-123",
							text: "Private message",
							$createdAt: "2024-01-01T11:00:00.000Z",
						},
					],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							userId: "user-2",
							displayName: "Bob",
							avatarFileId: "avatar-2",
						},
					],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=private",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(1);
			expect(data.results[0].type).toBe("dm");
			expect(data.results[0].message.text).toBe("Private message");
		});

		it("should filter by channel", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [
						{
							$id: "msg-1",
							userId: "user-1",
							text: "Channel message",
							$createdAt: "2024-01-01T10:00:00.000Z",
							channelId: "channel-123",
						},
					],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=test&channel=channel-123",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("equal(channelId,channel-123)"),
				]),
			);
		});

		it("should parse filter syntax from:@username", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=from:@alice%20test",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("equal(userId,alice)"),
					expect.stringContaining("search(text,test)"),
				]),
			);
		});

		it("should parse filter syntax in:#channel", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=in:%23general%20test",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("equal(channelId,general)"),
				]),
			);
		});

		it("should parse filter syntax has:image", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=has:image",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([expect.stringContaining("isNotNull(imageFileId)")]),
			);
		});

		it("should parse filter syntax mentions:me", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=mentions:me",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("search(mentions,current-user-123)"),
				]),
			);
		});

		it("should parse filter syntax before:YYYY-MM-DD", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=before:2024-01-01",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("lessThanEqual($createdAt,2024-01-01)"),
				]),
			);
		});

		it("should parse filter syntax after:YYYY-MM-DD", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=after:2024-01-01",
			);

			const response = await GET(request);

			expect(response.status).toBe(200);
			expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.arrayContaining([
					expect.stringContaining("greaterThanEqual($createdAt,2024-01-01)"),
				]),
			);
		});

		it("should return 400 if query is too short", async () => {
			const request = new NextRequest(
				"http://localhost/api/search/messages?q=a",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Search query must be at least 2 characters");
		});

		it("should return 400 if query is missing", async () => {
			const request = new NextRequest("http://localhost/api/search/messages");

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Search query must be at least 2 characters");
		});

		it("should require authentication", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			vi.mocked(getServerSession).mockResolvedValueOnce(null);

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=test",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should sort results by date descending", async () => {
			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: [
						{
							$id: "msg-1",
							userId: "user-1",
							text: "Older message",
							$createdAt: "2024-01-01T10:00:00.000Z",
							channelId: "channel-1",
						},
					],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							$id: "dm-1",
							conversationId: "conv-1",
							senderId: "user-2",
							receiverId: "current-user-123",
							text: "Newer message",
							$createdAt: "2024-01-02T10:00:00.000Z",
						},
					],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							userId: "user-1",
							displayName: "Alice",
						},
						{
							userId: "user-2",
							displayName: "Bob",
						},
					],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=message",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(2);
			// Newer message should be first
			expect(data.results[0].message.text).toBe("Newer message");
			expect(data.results[1].message.text).toBe("Older message");
		});

		it("should limit results to 50", async () => {
			const manyMessages = Array.from({ length: 60 }, (_, i) => ({
				$id: `msg-${i}`,
				userId: "user-1",
				text: `Message ${i}`,
				$createdAt: new Date(Date.now() - i * 1000).toISOString(),
				channelId: "channel-1",
			}));

			mockDatabases.listDocuments
				.mockResolvedValueOnce({
					documents: manyMessages,
				})
				.mockResolvedValueOnce({
					documents: [],
				})
				.mockResolvedValueOnce({
					documents: [
						{
							userId: "user-1",
							displayName: "Alice",
						},
					],
				});

			const request = new NextRequest(
				"http://localhost/api/search/messages?q=test",
			);

			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results.length).toBeLessThanOrEqual(50);
		});
	});
});
