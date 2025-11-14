/**
 * Tests for /api/roles endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock environment variables before importing the route
vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
vi.stubEnv("APPWRITE_API_KEY", "test-api-key");
vi.stubEnv("APPWRITE_DATABASE_ID", "test-db");

// Create persistent mocks
const { mockListDocuments, mockCreateDocument, mockUpdateDocument, mockDeleteDocument } = vi.hoisted(() => ({
	mockListDocuments: vi.fn(),
	mockCreateDocument: vi.fn(),
	mockUpdateDocument: vi.fn(),
	mockDeleteDocument: vi.fn(),
}));

// Mock node-appwrite Client and Databases
vi.mock("node-appwrite", () => {
	const Client = vi.fn().mockImplementation(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
		setKey: vi.fn().mockReturnThis(),
	}));

	const Databases = vi.fn().mockImplementation(() => ({
		listDocuments: mockListDocuments,
		createDocument: mockCreateDocument,
		updateDocument: mockUpdateDocument,
		deleteDocument: mockDeleteDocument,
	}));

	return {
		Client,
		Databases,
		Query: {
			equal: (field: string, value: string) => `equal(${field},${value})`,
			orderDesc: (field: string) => `orderDesc(${field})`,
			limit: (n: number) => `limit(${n})`,
		},
		ID: {
			unique: () => "mock-role-id",
		},
	};
});

describe("Roles API", () => {
	let GET: (request: NextRequest) => Promise<Response>;
	let POST: (request: NextRequest) => Promise<Response>;
	let PUT: (request: NextRequest) => Promise<Response>;
	let DELETE: (request: NextRequest) => Promise<Response>;

	beforeEach(async () => {
		vi.clearAllMocks();
		
		// Dynamically import the route handlers
		const module = await import("../../app/api/roles/route");
		GET = module.GET;
		POST = module.POST;
		PUT = module.PUT;
		DELETE = module.DELETE;
	});

	describe("GET /api/roles", () => {
		it("should return 400 if serverId is missing", async () => {
			const url = new URL("http://localhost/api/roles");
			const request = new NextRequest(url);
			
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("serverId");
		});

		it("should list roles for a server", async () => {
			mockListDocuments.mockResolvedValue({
				documents: [
					{
						$id: "role-1",
						serverId: "server-1",
						name: "Admin",
						color: "#FF0000",
						position: 100,
						administrator: true,
					},
					{
						$id: "role-2",
						serverId: "server-1",
						name: "Moderator",
						color: "#00FF00",
						position: 50,
						manageMessages: true,
					},
				],
			});

			const url = new URL("http://localhost/api/roles");
			url.searchParams.set("serverId", "server-1");
			const request = new NextRequest(url);
			
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.roles).toHaveLength(2);
			expect(data.roles[0].name).toBe("Admin");
			expect(mockListDocuments).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				expect.arrayContaining([
					expect.stringContaining("server-1"),
					expect.stringContaining("orderDesc"),
				])
			);
		});

		it("should handle errors gracefully", async () => {
			mockListDocuments.mockRejectedValue(new Error("Database error"));

			const url = new URL("http://localhost/api/roles");
			url.searchParams.set("serverId", "server-1");
			const request = new NextRequest(url);
			
			const response = await GET(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBeTruthy();
		});
	});

	describe("POST /api/roles", () => {
		it("should return 400 if serverId is missing", async () => {
			const request = new NextRequest("http://localhost/api/roles", {
				method: "POST",
				body: JSON.stringify({ name: "New Role" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("serverId");
		});

		it("should return 400 if name is missing", async () => {
			const request = new NextRequest("http://localhost/api/roles", {
				method: "POST",
				body: JSON.stringify({ serverId: "server-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("name");
		});

		it("should create a role with default values", async () => {
			mockCreateDocument.mockResolvedValue({
				$id: "role-1",
				serverId: "server-1",
				name: "New Role",
				color: "#5865F2",
				position: 0,
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: true,
				memberCount: 0,
			});

			const request = new NextRequest("http://localhost/api/roles", {
				method: "POST",
				body: JSON.stringify({
					serverId: "server-1",
					name: "New Role",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.role).toBeDefined();
			expect(data.role.name).toBe("New Role");
			expect(data.role.color).toBe("#5865F2");
			expect(data.role.memberCount).toBe(0);
			
			expect(mockCreateDocument).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				"mock-role-id",
				expect.objectContaining({
					serverId: "server-1",
					name: "New Role",
					memberCount: 0,
				})
			);
		});

		it("should create a role with custom permissions", async () => {
			mockCreateDocument.mockResolvedValue({
				$id: "role-1",
				serverId: "server-1",
				name: "Admin",
				administrator: true,
				manageServer: true,
			});

			const request = new NextRequest("http://localhost/api/roles", {
				method: "POST",
				body: JSON.stringify({
					serverId: "server-1",
					name: "Admin",
					color: "#FF0000",
					position: 100,
					administrator: true,
					manageServer: true,
					manageRoles: true,
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(mockCreateDocument).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				"mock-role-id",
				expect.objectContaining({
					administrator: true,
					manageServer: true,
					manageRoles: true,
				})
			);
		});
	});

	describe("PUT /api/roles", () => {
		it("should return 400 if roleId is missing", async () => {
			const request = new NextRequest("http://localhost/api/roles", {
				method: "PUT",
				body: JSON.stringify({ name: "Updated" }),
			});

			const response = await PUT(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("Role ID");
		});

		it("should update role properties", async () => {
			mockUpdateDocument.mockResolvedValue({
				$id: "role-1",
				name: "Updated Role",
				color: "#00FF00",
				position: 75,
			});

			const request = new NextRequest("http://localhost/api/roles", {
				method: "PUT",
				body: JSON.stringify({
					$id: "role-1",
					name: "Updated Role",
					color: "#00FF00",
					position: 75,
				}),
			});

			const response = await PUT(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.role).toBeDefined();
			expect(mockUpdateDocument).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				"role-1",
				expect.objectContaining({
					name: "Updated Role",
					color: "#00FF00",
					position: 75,
				})
			);
		});

		it("should update only provided fields", async () => {
			mockUpdateDocument.mockResolvedValue({
				$id: "role-1",
				manageMessages: true,
			});

			const request = new NextRequest("http://localhost/api/roles", {
				method: "PUT",
				body: JSON.stringify({
					$id: "role-1",
					manageMessages: true,
				}),
			});

			const response = await PUT(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(mockUpdateDocument).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				"role-1",
				expect.objectContaining({
					manageMessages: true,
				})
			);
		});
	});

	describe("DELETE /api/roles", () => {
		it("should return 400 if roleId is missing", async () => {
			const url = new URL("http://localhost/api/roles");
			const request = new NextRequest(url, { method: "DELETE" });
			
			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain("roleId");
		});

		it("should delete a role", async () => {
			mockDeleteDocument.mockResolvedValue({});

			const url = new URL("http://localhost/api/roles");
			url.searchParams.set("roleId", "role-1");
			const request = new NextRequest(url, { method: "DELETE" });
			
			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockDeleteDocument).toHaveBeenCalledWith(
				expect.any(String),
				"roles",
				"role-1"
			);
		});

		it("should handle deletion errors gracefully", async () => {
			mockDeleteDocument.mockRejectedValue(new Error("Role not found"));

			const url = new URL("http://localhost/api/roles");
			url.searchParams.set("roleId", "nonexistent");
			const request = new NextRequest(url, { method: "DELETE" });
			
			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBeTruthy();
		});
	});
});
