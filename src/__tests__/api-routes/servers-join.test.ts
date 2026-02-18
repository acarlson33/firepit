/**
 * Tests for /api/servers/join endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create persistent mocks
const { mockGetDocument, mockListDocuments, mockCreateDocument, mockUpdateDocument, mockGetServerSession } = vi.hoisted(() => ({
	mockGetDocument: vi.fn(),
	mockListDocuments: vi.fn(),
	mockCreateDocument: vi.fn(),
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
			listDocuments: mockListDocuments,
			createDocument: mockCreateDocument,
			updateDocument: mockUpdateDocument,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			servers: "servers-collection",
			memberships: "memberships-collection",
		},
	})),
	perms: {
		serverOwner: (userId: string) => [`read("user:${userId}")`, `write("user:${userId}")`],
	},
}));

vi.mock("node-appwrite", () => ({
	ID: {
		unique: () => "mock-membership-id",
	},
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
	},
}));

// Mock New Relic utilities
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

describe("Server Join API", () => {
	let POST: (request: NextRequest) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handler
		const module = await import("../../app/api/servers/join/route");
		POST = module.POST;
	});

	describe("POST /api/servers/join", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockGetServerSession.mockResolvedValue(null);

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should return 400 if serverId is missing", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("serverId");
		});

		it("should return 404 if server does not exist", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockRejectedValue(new Error("Document not found"));

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "nonexistent-server" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toContain("Server not found");
		});

		it("should return 400 if user is already a member", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "server-1",
				name: "Test Server",
				memberCount: 5,
			});

			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "membership-1",
						userId: "user-1",
						serverId: "server-1",
					},
				],
			});

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("already a member");
		});

		it("should successfully join a server", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "server-1",
				name: "Test Server",
				memberCount: 5,
			});

			// Mock listDocuments to handle both calls:
			// 1. Check existing membership (returns empty)
			// 2. Get actual member count (returns total: 6 after join)
			let callCount = 0;
			mockListDocuments.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// First call: check existing membership
					return Promise.resolve({ documents: [], total: 0 });
				}
				// Second call: get actual member count after join
				return Promise.resolve({ documents: [], total: 6 });
			});

			mockCreateDocument.mockResolvedValue({
				$id: "membership-1",
				userId: "user-1",
				serverId: "server-1",
				role: "member",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "server-1",
				memberCount: 6,
			});

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			
			// Verify membership was created
			expect(mockCreateDocument).toHaveBeenCalledWith(
				"test-db",
				"memberships-collection",
				"mock-membership-id",
				{
					serverId: "server-1",
					userId: "user-1",
					role: "member",
				},
				expect.any(Array)
			);

			// Verify member count was synced from actual memberships
			expect(mockUpdateDocument).toHaveBeenCalledWith(
				"test-db",
				"servers-collection",
				"server-1",
				{ memberCount: 6 }
			);
		});

		it("should handle missing memberCount gracefully", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "server-1",
				name: "Test Server",
				// No memberCount field
			});

			// Mock listDocuments to handle both calls:
			// 1. Check existing membership (returns empty)
			// 2. Get actual member count (returns total: 1 after join)
			let callCount = 0;
			mockListDocuments.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// First call: check existing membership
					return Promise.resolve({ documents: [], total: 0 });
				}
				// Second call: get actual member count after join
				return Promise.resolve({ documents: [], total: 1 });
			});

			mockCreateDocument.mockResolvedValue({
				$id: "membership-1",
				userId: "user-1",
				serverId: "server-1",
				role: "member",
			});

			mockUpdateDocument.mockResolvedValue({
				$id: "server-1",
				memberCount: 1,
			});

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			
			// Should sync count from actual memberships (1 member after join)
			expect(mockUpdateDocument).toHaveBeenCalledWith(
				"test-db",
				"servers-collection",
				"server-1",
				{ memberCount: 1 }
			);
		});

		it("should succeed even if member count update fails", async () => {
			mockGetServerSession.mockResolvedValue({
				$id: "user-1",
				name: "Test User",
			});

			mockGetDocument.mockResolvedValue({
				$id: "server-1",
				name: "Test Server",
				memberCount: 5,
			});

			mockListDocuments.mockResolvedValue({
				documents: [],
			});

			mockCreateDocument.mockResolvedValue({
				$id: "membership-1",
				userId: "user-1",
				serverId: "server-1",
				role: "member",
			});

			// Member count update fails
			mockUpdateDocument.mockRejectedValue(new Error("Update failed"));

			const request = new NextRequest("http://localhost/api/servers/join", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			// Should still succeed since membership was created
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});
});
