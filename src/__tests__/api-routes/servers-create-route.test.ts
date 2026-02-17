import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/servers/create/route";

const { mockSession, mockCreateServer } = vi.hoisted(() => ({
    mockSession: vi.fn(),
    mockCreateServer: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/appwrite-servers", () => ({ createServer: mockCreateServer }));

describe("Servers create route", () => {
    beforeEach(() => {
        mockSession.mockReset();
        mockCreateServer.mockReset();
    });

    it("returns 401 when not authenticated", async () => {
        mockSession.mockResolvedValue(null);

        const request = new NextRequest("http://localhost/api/servers/create", {
            method: "POST",
            body: JSON.stringify({ name: "Test" }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it("validates server name", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const request = new NextRequest("http://localhost/api/servers/create", {
            method: "POST",
            body: JSON.stringify({ name: "  " }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Server name is required");
    });

    it("creates a server when payload is valid", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockCreateServer.mockResolvedValue({
            $id: "server-1",
            name: "My Server",
            ownerId: "user-1",
            memberCount: 1,
        });

        const request = new NextRequest("http://localhost/api/servers/create", {
            method: "POST",
            body: JSON.stringify({ name: "My Server" }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.server.name).toBe("My Server");
        expect(mockCreateServer).toHaveBeenCalledWith("My Server");
    });

    it("returns 500 when createServer throws", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockCreateServer.mockRejectedValue(new Error("disabled"));

        const request = new NextRequest("http://localhost/api/servers/create", {
            method: "POST",
            body: JSON.stringify({ name: "My Server" }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("disabled");
    });

    it("returns 400 for invalid JSON payload", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const request = new Request("http://localhost/api/servers/create", {
            method: "POST",
            body: "{",
            headers: {
                "Content-Type": "application/json",
            },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid JSON payload");
    });
});
