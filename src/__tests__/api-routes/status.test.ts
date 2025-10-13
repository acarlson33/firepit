import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, PATCH } from "../../app/api/status/route";

// Mock node-appwrite for server-side
vi.mock("node-appwrite", () => ({
	ID: { unique: () => "mock-id" },
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
	},
}));

// Create mock databases object
const mockDatabases = {
	listDocuments: vi.fn(),
	createDocument: vi.fn(),
	updateDocument: vi.fn(),
};

// Mock dependencies
vi.mock("@/lib/appwrite-core", () => ({
	getServerClient: vi.fn(() => ({
		databases: mockDatabases,
	})),
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			statuses: "statuses-collection",
		},
	})),
	perms: {
		status: vi.fn(() => ["read(any)", "write(user:test-user)"]),
		serverOwner: vi.fn(() => ["write(user:test-user)"]),
	},
}));

describe("Status API Routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("POST /api/status", () => {
		it("should create a new status document", async () => {
			mockDatabases.listDocuments.mockResolvedValue({ documents: [] });
			mockDatabases.createDocument.mockResolvedValue({
				$id: "status-1",
				userId: "user-1",
				status: "online",
				customMessage: "",
				lastSeenAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/status", {
				method: "POST",
				body: JSON.stringify({
					userId: "user-1",
					status: "online",
					customMessage: "",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.userId).toBe("user-1");
			expect(data.status).toBe("online");
			expect(mockDatabases.createDocument).toHaveBeenCalled();
		});

		it("should update existing status document", async () => {
			const existingDoc = {
				$id: "status-1",
				userId: "user-1",
				status: "away",
				isManuallySet: false,
			};

			mockDatabases.listDocuments.mockResolvedValue({
				documents: [existingDoc],
			});
			mockDatabases.updateDocument.mockResolvedValue({
				...existingDoc,
				status: "online",
			});

			const request = new NextRequest("http://localhost/api/status", {
				method: "POST",
				body: JSON.stringify({
					userId: "user-1",
					status: "online",
				}),
			});

			const response = await POST(request);
			await response.json();

			expect(response.status).toBe(200);
			expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
				"test-db",
				"statuses-collection",
				"status-1",
				expect.any(Object),
				expect.any(Array),
			);
		});

		it("should return 400 if userId or status is missing", async () => {
			const request = new NextRequest("http://localhost/api/status", {
				method: "POST",
				body: JSON.stringify({ userId: "user-1" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("userId and status are required");
		});
	});

	describe("PATCH /api/status", () => {
		it("should update lastSeenAt timestamp", async () => {
			mockDatabases.listDocuments.mockResolvedValue({
				documents: [
					{
						$id: "status-1",
						userId: "user-1",
						status: "online",
					},
				],
			});
			mockDatabases.updateDocument.mockResolvedValue({
				$id: "status-1",
				userId: "user-1",
				status: "online",
				lastSeenAt: new Date().toISOString(),
			});

			const request = new NextRequest("http://localhost/api/status", {
				method: "PATCH",
				body: JSON.stringify({ userId: "user-1" }),
			});

			const response = await PATCH(request);
			await response.json();

			expect(response.status).toBe(200);
			expect(mockDatabases.updateDocument).toHaveBeenCalled();
		});

		it("should return 400 if userId is missing", async () => {
			const request = new NextRequest("http://localhost/api/status", {
				method: "PATCH",
				body: JSON.stringify({}),
			});

			const response = await PATCH(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("userId is required");
		});
	});
});
