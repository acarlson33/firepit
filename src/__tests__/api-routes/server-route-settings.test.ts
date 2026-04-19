import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockUpdateDocument,
    mockDeleteFile,
    mockGetServerPermissionsForUser,
    mockRecordAudit,
    mockGetActualMemberCount,
    mockGetUserRoles,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
    mockRecordAudit: vi.fn(),
    mockGetActualMemberCount: vi.fn(),
    mockGetUserRoles: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
        },
        storage: {
            deleteFile: mockDeleteFile,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "https://appwrite.local/v1",
        project: "project-1",
        databaseId: "test-db",
        collections: {
            servers: "servers-collection",
        },
        buckets: {
            images: "images-bucket",
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-audit", () => ({
    recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/membership-count", () => ({
    getActualMemberCount: mockGetActualMemberCount,
}));

vi.mock("@/lib/appwrite-roles", () => ({
    getUserRoles: mockGetUserRoles,
}));

describe("PATCH /api/servers/[serverId]", () => {
    let PATCH: (
        request: NextRequest,
        context: { params: Promise<{ serverId: string }> },
    ) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await import("../../app/api/servers/[serverId]/route");
        PATCH = module.PATCH;

        mockGetActualMemberCount.mockResolvedValue(7);
        mockGetUserRoles.mockResolvedValue({
            isAdmin: true,
            isModerator: true,
        });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: {
                manageServer: true,
            },
        });
    });

    it("returns 401 for unauthenticated requests", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({ name: "Updated Name" }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        expect(response.status).toBe(401);
    });

    it("returns 403 when user cannot manage server", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-2" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            ownerId: "owner-1",
        });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: {
                manageServer: false,
            },
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({ name: "Updated Name" }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        expect(response.status).toBe(403);
    });

    it("updates settings and deletes replaced stale icon files", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "manager-1" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            name: "Current Server",
            ownerId: "owner-1",
            iconFileId: "old-icon",
            bannerFileId: "old-banner",
            isPublic: true,
            $createdAt: "2026-04-14T00:00:00.000Z",
        });
        mockUpdateDocument.mockResolvedValue({
            $id: "server-1",
            name: "Updated Server",
            ownerId: "owner-1",
            iconFileId: "new-icon",
            bannerFileId: null,
            description: "Updated description",
            isPublic: false,
            $createdAt: "2026-04-14T00:00:00.000Z",
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({
                    name: "Updated Server",
                    description: "Updated description",
                    iconFileId: "new-icon",
                    bannerFileId: null,
                    isPublic: false,
                }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "test-db",
            "servers-collection",
            "server-1",
            expect.objectContaining({
                name: "Updated Server",
                description: "Updated description",
                iconFileId: "new-icon",
                bannerFileId: null,
                isPublic: false,
            }),
        );
        expect(mockDeleteFile).toHaveBeenCalledWith("images-bucket", "old-icon");
        expect(mockDeleteFile).toHaveBeenCalledWith("images-bucket", "old-banner");
        expect(mockRecordAudit).toHaveBeenCalledWith(
            "server_settings_updated",
            "server-1",
            "manager-1",
            expect.objectContaining({
                changedFields: expect.arrayContaining([
                    "name",
                    "description",
                    "iconFileId",
                    "bannerFileId",
                    "isPublic",
                ]),
            }),
        );
        expect(data.server.name).toBe("Updated Server");
        expect(data.server.isPublic).toBe(false);
    });

    it("updates defaultOnSignup when provided", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "owner-1" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            name: "Current Server",
            ownerId: "owner-1",
            defaultOnSignup: false,
            $createdAt: "2026-04-14T00:00:00.000Z",
        });
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "server-old-default",
                    defaultOnSignup: true,
                },
            ],
        });
        mockUpdateDocument
            .mockResolvedValueOnce({
                $id: "server-1",
                name: "Current Server",
                ownerId: "owner-1",
                defaultOnSignup: true,
                $createdAt: "2026-04-14T00:00:00.000Z",
            })
            .mockResolvedValueOnce({ $id: "server-old-default" });

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({
                    defaultOnSignup: true,
                }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpdateDocument).toHaveBeenNthCalledWith(
            1,
            "test-db",
            "servers-collection",
            "server-1",
            expect.objectContaining({
                defaultOnSignup: true,
            }),
        );
        expect(mockUpdateDocument).toHaveBeenNthCalledWith(
            2,
            "test-db",
            "servers-collection",
            "server-old-default",
            expect.objectContaining({
                defaultOnSignup: false,
            }),
        );
        expect(mockRecordAudit).toHaveBeenCalledWith(
            "server_settings_updated",
            "server-1",
            "owner-1",
            expect.objectContaining({
                changedFields: expect.arrayContaining(["defaultOnSignup"]),
            }),
        );
        expect(data.server.defaultOnSignup).toBe(true);
    });

    it("returns 403 when non-admin tries to update defaultOnSignup", async () => {
        mockGetUserRoles.mockResolvedValue({
            isAdmin: false,
            isModerator: false,
        });
        mockGetServerSession.mockResolvedValue({ $id: "owner-1" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            ownerId: "owner-1",
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({
                    defaultOnSignup: true,
                }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe(
            "Only instance administrators can update defaultOnSignup",
        );
    });

    it("returns 400 for invalid defaultOnSignup type", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "owner-1" });
        mockGetDocument.mockResolvedValue({
            $id: "server-1",
            ownerId: "owner-1",
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/servers/server-1", {
                method: "PATCH",
                body: JSON.stringify({
                    defaultOnSignup: "yes",
                }),
            }),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("defaultOnSignup must be a boolean");
    });
});
