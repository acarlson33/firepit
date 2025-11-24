import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST, GET } from "@/app/api/servers/[serverId]/invites/route";
import * as authServer from "@/lib/auth-server";
import * as appwriteRoles from "@/lib/appwrite-roles";
import * as appwriteInvites from "@/lib/appwrite-invites";
import * as appwriteCore from "@/lib/appwrite-core";

// Create persistent mocks using vi.hoisted
const { mockGetDocument } = vi.hoisted(() => ({
	mockGetDocument: vi.fn(),
}));

// Mock modules
vi.mock("@/lib/auth-server");
vi.mock("@/lib/appwrite-roles", () => ({
	getUserRoles: vi.fn(),
}));
vi.mock("@/lib/appwrite-invites");
vi.mock("@/lib/posthog-utils", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
	recordError: vi.fn(),
}));
vi.mock("@/lib/appwrite-core", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			getDocument: mockGetDocument,
		},
	})),
	getEnvConfig: () => ({
		databaseId: "test-db",
		collections: {
			servers: "servers",
			invites: "invites",
		},
	}),
}));

describe("POST /api/servers/[serverId]/invites", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create invite when user is server owner", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-1",
			channelId: null,
			expiresAt: null,
			maxUses: null,
			currentUses: 0,
			temporary: false,
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.createInvite).mockResolvedValue(mockInvite as never);

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({
				channelId: null,
				expiresAt: null,
				maxUses: null,
				temporary: false,
			}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.$id).toBe("invite-1");
		expect(data.code).toBe("TEST123");
		expect(appwriteInvites.createInvite).toHaveBeenCalledWith({
			serverId: "server-1",
			creatorId: "user-1",
			channelId: null,
			expiresAt: null,
			maxUses: null,
			temporary: false,
		});
	});

	it("should create invite when user is global admin", async () => {
		const mockUser = { $id: "admin-user" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};
		const mockInvite = {
			$id: "invite-1",
			code: "ADMIN123",
			serverId: "server-1",
			creatorId: "admin-user",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: true } as never);
		vi.mocked(appwriteInvites.createInvite).mockResolvedValue(mockInvite as never);

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.code).toBe("ADMIN123");
	});

	it("should create invite with custom settings", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};
		const expiresAt = new Date(Date.now() + 86400000).toISOString();
		const mockInvite = {
			$id: "invite-1",
			code: "CUSTOM123",
			serverId: "server-1",
			creatorId: "user-1",
			channelId: "channel-1",
			expiresAt,
			maxUses: 10,
			temporary: true,
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.createInvite).mockResolvedValue(mockInvite as never);

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({
				channelId: "channel-1",
				expiresAt,
				maxUses: 10,
				temporary: true,
			}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channelId).toBe("channel-1");
		expect(data.maxUses).toBe(10);
		expect(data.temporary).toBe(true);
	});

	it("should return 401 if not authenticated", async () => {
		vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Unauthorized");
	});

	it("should return 400 if serverId is missing", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);

		const request = new Request("http://localhost/api/servers//invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("serverId is required");
	});

	it("should return 404 if server not found", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockRejectedValue(new Error("Not found"));

		const request = new Request("http://localhost/api/servers/invalid/invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "invalid" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Server not found");
	});

	it("should return 403 if user lacks permissions", async () => {
		const mockUser = { $id: "user-2" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.error).toContain("Insufficient permissions");
	});

	it("should handle creation errors", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.createInvite).mockRejectedValue(new Error("Database error"));

		const request = new Request("http://localhost/api/servers/server-1/invites", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database error");
	});
});

describe("GET /api/servers/[serverId]/invites", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should list invites when user is server owner", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};
		const mockInvites = [
			{
				$id: "invite-1",
				code: "INVITE1",
				serverId: "server-1",
				creatorId: "user-1",
			},
			{
				$id: "invite-2",
				code: "INVITE2",
				serverId: "server-1",
				creatorId: "user-1",
			},
		];

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue(mockInvites as never);

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toHaveLength(2);
		expect(data[0].code).toBe("INVITE1");
		expect(appwriteInvites.listServerInvites).toHaveBeenCalledWith("server-1");
	});

	it("should list invites when user is global admin", async () => {
		const mockUser = { $id: "admin-user" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};
		const mockInvites = [
			{
				$id: "invite-1",
				code: "ADMIN1",
			},
		];

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: true } as never);
		vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue(mockInvites as never);

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toHaveLength(1);
	});

	it("should return empty array when no invites exist", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.listServerInvites).mockResolvedValue([] as never);

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toHaveLength(0);
	});

	it("should return 401 if not authenticated", async () => {
		vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Unauthorized");
	});

	it("should return 404 if server not found", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockRejectedValue(new Error("Not found"));

		const request = new Request("http://localhost/api/servers/invalid/invites");
		const params = Promise.resolve({ serverId: "invalid" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Server not found");
	});

	it("should return 403 if user lacks permissions", async () => {
		const mockUser = { $id: "user-2" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.error).toContain("Insufficient permissions");
	});

	it("should handle listing errors", async () => {
		const mockUser = { $id: "user-1" };
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.listServerInvites).mockRejectedValue(new Error("Query failed"));

		const request = new Request("http://localhost/api/servers/server-1/invites");
		const params = Promise.resolve({ serverId: "server-1" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Query failed");
	});
});
