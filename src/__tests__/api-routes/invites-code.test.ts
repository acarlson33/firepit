import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, DELETE } from "@/app/api/invites/[code]/route";
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
vi.mock("@/lib/newrelic-utils", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
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

describe("GET /api/invites/[code]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return invite preview with server info", async () => {
		const mockInvite = {
			code: "TEST123",
			serverId: "server-1",
			channelId: "channel-1",
			expiresAt: null,
			maxUses: null,
			currentUses: 0,
			temporary: false,
		};

		const mockServerPreview = {
			id: "server-1",
			name: "Test Server",
			memberCount: 10,
			icon: null,
		};

		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		vi.mocked(appwriteInvites.getServerPreview).mockResolvedValue(mockServerPreview as never);

		const request = new Request("http://localhost/api/invites/TEST123");
		const params = Promise.resolve({ code: "TEST123" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.invite.code).toBe("TEST123");
		expect(data.server.name).toBe("Test Server");
		expect(appwriteInvites.getInviteByCode).toHaveBeenCalledWith("TEST123");
	});

	it("should return 404 if invite not found", async () => {
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/invites/INVALID");
		const params = Promise.resolve({ code: "INVALID" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Invite not found");
	});

	it("should return 404 if server not found", async () => {
		const mockInvite = {
			code: "TEST123",
			serverId: "invalid-server",
			channelId: "channel-1",
		};

		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		vi.mocked(appwriteInvites.getServerPreview).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/invites/TEST123");
		const params = Promise.resolve({ code: "TEST123" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Server not found");
	});

	it("should handle errors gracefully", async () => {
		vi.mocked(appwriteInvites.getInviteByCode).mockRejectedValue(new Error("Database error"));

		const request = new Request("http://localhost/api/invites/TEST123");
		const params = Promise.resolve({ code: "TEST123" });

		const response = await GET(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database error");
	});
});

describe("DELETE /api/invites/[code]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should revoke invite when user is server owner", async () => {
		const mockUser = { $id: "user-1" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-2",
		};
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.revokeInvite).mockResolvedValue(true as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(appwriteInvites.revokeInvite).toHaveBeenCalledWith("invite-1");
	});

	it("should revoke invite when user is invite creator", async () => {
		const mockUser = { $id: "user-2" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-2",
		};
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.revokeInvite).mockResolvedValue(true as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
	});

	it("should revoke invite when user is global admin", async () => {
		const mockUser = { $id: "admin-user" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-2",
		};
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: true } as never);
		vi.mocked(appwriteInvites.revokeInvite).mockResolvedValue(true as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
	});

	it("should return 401 if not authenticated", async () => {
		vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Unauthorized");
	});

	it("should return 404 if invite not found", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Invite not found");
	});

	it("should return 404 if server not found", async () => {
		const mockUser = { $id: "user-1" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-2",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockRejectedValue(new Error("Not found"));

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe("Server not found");
	});

	it("should return 403 if user lacks permissions", async () => {
		const mockUser = { $id: "user-3" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-2",
		};
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(403);
		expect(data.error).toContain("Insufficient permissions");
	});

	it("should return 500 if revoke fails", async () => {
		const mockUser = { $id: "user-1" };
		const mockInvite = {
			$id: "invite-1",
			code: "TEST123",
			serverId: "server-1",
			creatorId: "user-1",
		};
		const mockServer = {
			$id: "server-1",
			ownerId: "user-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockResolvedValue(mockInvite as never);
		mockGetDocument.mockResolvedValue(mockServer);
		vi.mocked(appwriteRoles.getUserRoles).mockResolvedValue({ isAdmin: false } as never);
		vi.mocked(appwriteInvites.revokeInvite).mockResolvedValue(false as never);

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to revoke invite");
	});

	it("should handle unexpected errors", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.getInviteByCode).mockRejectedValue(new Error("Database error"));

		const request = new Request("http://localhost/api/invites/TEST123", {
			method: "DELETE",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await DELETE(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database error");
	});
});
