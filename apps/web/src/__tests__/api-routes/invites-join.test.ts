import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/invites/[code]/join/route";
import * as authServer from "@/lib/auth-server";
import * as appwriteInvites from "@/lib/appwrite-invites";

// Mock modules
vi.mock("@/lib/auth-server");
vi.mock("@/lib/appwrite-invites");
vi.mock("@/lib/newrelic-utils", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
	recordError: vi.fn(),
}));

describe("POST /api/invites/[code]/join", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should join server with valid invite", async () => {
		const mockUser = { $id: "user-1" };
		const mockResult = {
			success: true,
			serverId: "server-1",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockResolvedValue(mockResult as never);

		const request = new Request("http://localhost/api/invites/TEST123/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.serverId).toBe("server-1");
		expect(appwriteInvites.useInvite).toHaveBeenCalledWith("TEST123", "user-1");
	});

	it("should return 401 if not authenticated", async () => {
		vi.mocked(authServer.getServerSession).mockResolvedValue(null as never);

		const request = new Request("http://localhost/api/invites/TEST123/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Unauthorized");
	});

	it("should return 400 if invite is invalid", async () => {
		const mockUser = { $id: "user-1" };
		const mockResult = {
			success: false,
			error: "Invite not found",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockResolvedValue(mockResult as never);

		const request = new Request("http://localhost/api/invites/INVALID/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "INVALID" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("Invite not found");
	});

	it("should return 400 if invite is expired", async () => {
		const mockUser = { $id: "user-1" };
		const mockResult = {
			success: false,
			error: "Invite has expired",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockResolvedValue(mockResult as never);

		const request = new Request("http://localhost/api/invites/EXPIRED/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "EXPIRED" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("Invite has expired");
	});

	it("should return 400 if invite max uses reached", async () => {
		const mockUser = { $id: "user-1" };
		const mockResult = {
			success: false,
			error: "Invite has reached maximum uses",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockResolvedValue(mockResult as never);

		const request = new Request("http://localhost/api/invites/MAXED/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "MAXED" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("Invite has reached maximum uses");
	});

	it("should return 400 if user is already a member", async () => {
		const mockUser = { $id: "user-1" };
		const mockResult = {
			success: false,
			error: "User is already a member of this server",
		};

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockResolvedValue(mockResult as never);

		const request = new Request("http://localhost/api/invites/TEST123/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("User is already a member of this server");
	});

	it("should handle unexpected errors", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockRejectedValue(new Error("Database connection lost"));

		const request = new Request("http://localhost/api/invites/TEST123/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database connection lost");
	});

	it("should handle non-Error exceptions", async () => {
		const mockUser = { $id: "user-1" };

		vi.mocked(authServer.getServerSession).mockResolvedValue(mockUser as never);
		vi.mocked(appwriteInvites.useInvite).mockRejectedValue("Unknown error");

		const request = new Request("http://localhost/api/invites/TEST123/join", {
			method: "POST",
		});
		const params = Promise.resolve({ code: "TEST123" });

		const response = await POST(request, { params });
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to join server");
	});
});
