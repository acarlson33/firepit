import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/servers/default-signup/route";

const { mockGetServerSession, mockGetUserRoles, mockListDocuments } =
    vi.hoisted(() => ({
        mockGetServerSession: vi.fn(),
        mockGetUserRoles: vi.fn(),
        mockListDocuments: vi.fn(),
    }));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-roles", () => ({
    getUserRoles: mockGetUserRoles,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            servers: "servers-collection",
        },
    })),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
        },
    })),
}));

describe("GET /api/servers/default-signup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await GET();

        expect(response.status).toBe(401);
        expect(mockGetUserRoles).not.toHaveBeenCalled();
        expect(mockListDocuments).not.toHaveBeenCalled();
    });

    it("returns 403 for users who are neither admin nor moderator", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetUserRoles.mockResolvedValue({ isAdmin: false, isModerator: false });

        const response = await GET();

        expect(response.status).toBe(403);
    });

    it("returns 403 for moderators when not admin", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-2" });
        mockGetUserRoles.mockResolvedValue({ isAdmin: false, isModerator: true });

        const response = await GET();

        expect(response.status).toBe(403);
        expect(mockListDocuments).not.toHaveBeenCalled();
    });

    it("returns null when no default server is configured", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "admin-1" });
        mockGetUserRoles.mockResolvedValue({ isAdmin: true, isModerator: true });
        mockListDocuments.mockResolvedValue({ documents: [] });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.server).toBeNull();
    });

    it("returns the configured default signup server", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "admin-1" });
        mockGetUserRoles.mockResolvedValue({ isAdmin: true, isModerator: true });
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "server-default",
                    name: "General",
                },
            ],
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.server).toEqual({
            $id: "server-default",
            name: "General",
        });
    });
});
