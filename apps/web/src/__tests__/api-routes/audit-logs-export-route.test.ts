import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSession } = vi.hoisted(() => ({ mockSession: vi.fn() }));
const { mockGetServerPermissionsForUser } = vi.hoisted(() => ({
    mockGetServerPermissionsForUser: vi.fn(),
}));
const { mockListDocuments } = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockSession }));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "db",
        collections: {
            servers: "servers",
            memberships: "memberships",
            roles: "roles",
            channels: "channels",
            audit: "audit",
            profiles: "profiles",
        },
    })),
}));

async function loadRoute() {
    vi.resetModules();
    const module =
        await import("../../app/api/servers/[serverId]/audit-logs/export/route");
    return module;
}

describe("audit logs export route", () => {
    beforeEach(() => {
        mockSession.mockReset();
        mockGetServerPermissionsForUser.mockReset();
        mockListDocuments.mockReset();
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageServer: true },
        });
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "log-1",
                    $createdAt: "t1",
                    action: "ban",
                    userId: "mod-1",
                    targetUserId: "user-1",
                    moderatorName: "Mod",
                    targetUserName: "Target",
                    reason: "rule",
                    details: "details",
                },
            ],
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);
        const { GET } = await loadRoute();

        const response = await GET(
            new NextRequest(
                "http://localhost/api/servers/server-1/audit-logs/export",
            ),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it("returns JSON export by default", async () => {
        const { GET } = await loadRoute();
        const response = await GET(
            new NextRequest(
                "http://localhost/api/servers/server-1/audit-logs/export",
            ),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const text = await response.text();
        expect(response.headers.get("Content-Type")).toContain(
            "application/json",
        );
        expect(text).toContain("ban");
    });

    it("returns 403 when caller lacks manageServer", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageServer: false },
        });
        const { GET } = await loadRoute();

        const response = await GET(
            new NextRequest(
                "http://localhost/api/servers/server-1/audit-logs/export",
            ),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns CSV when requested", async () => {
        const { GET } = await loadRoute();
        const response = await GET(
            new NextRequest(
                "http://localhost/api/servers/server-1/audit-logs/export?format=csv",
            ),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const text = await response.text();
        expect(response.headers.get("Content-Type")).toContain("text/csv");
        expect(text).toContain("Moderator ID");
        expect(text).toContain("ban");
    });

    it("returns 500 when the audit log query fails", async () => {
        mockListDocuments.mockRejectedValue(new Error("db down"));

        const { GET } = await loadRoute();
        const response = await GET(
            new NextRequest(
                "http://localhost/api/servers/server-1/audit-logs/export",
            ),
            {
                params: Promise.resolve({ serverId: "server-1" }),
            },
        );

        const data = await response.json();
        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to export audit logs");
    });
});
