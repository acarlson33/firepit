/**
 * Tests for /api/channel-permissions endpoint
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockGetServerPermissionsForUser } = vi.hoisted(
    () => ({
        mockGetServerSession: vi.fn(),
        mockGetServerPermissionsForUser: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

// Mock node-appwrite
vi.mock("node-appwrite", () => {
    const mockDatabases = {
        listDocuments: vi.fn(),
        createDocument: vi.fn(),
        updateDocument: vi.fn(),
        deleteDocument: vi.fn(),
        getDocument: vi.fn(),
    };

    return {
        Client: vi.fn(() => ({
            setEndpoint: vi.fn().mockReturnThis(),
            setProject: vi.fn().mockReturnThis(),
            setKey: vi.fn().mockReturnThis(),
        })),
        Databases: vi.fn(() => mockDatabases),
        Query: {
            equal: vi.fn((field, value) => `equal(${field},${value})`),
            limit: vi.fn((value) => `limit(${value})`),
        },
        ID: {
            unique: vi.fn(() => "unique-id"),
        },
    };
});

import { Databases } from "node-appwrite";

let GET: typeof import("@/app/api/channel-permissions/route").GET;
let POST: typeof import("@/app/api/channel-permissions/route").POST;
let PUT: typeof import("@/app/api/channel-permissions/route").PUT;
let DELETE: typeof import("@/app/api/channel-permissions/route").DELETE;

function ensureEnv() {
    process.env.APPWRITE_ENDPOINT =
        process.env.APPWRITE_ENDPOINT || "https://localhost/v1";
    process.env.APPWRITE_PROJECT_ID =
        process.env.APPWRITE_PROJECT_ID || "project-test";
    process.env.APPWRITE_API_KEY =
        process.env.APPWRITE_API_KEY || "api-key-test";
    process.env.APPWRITE_DATABASE_ID =
        process.env.APPWRITE_DATABASE_ID || "main";
}

beforeAll(async () => {
    ensureEnv();
    const mod = await import("@/app/api/channel-permissions/route");
    GET = mod.GET;
    POST = mod.POST;
    PUT = mod.PUT;
    DELETE = mod.DELETE;
});

describe("GET /api/channel-permissions", () => {
    let mockListDocuments: any;
    let mockGetDocument: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        ensureEnv();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: true },
        });
        const databases = new Databases({} as any);
        mockListDocuments = databases.listDocuments as any;
        mockGetDocument = databases.getDocument as any;
        mockGetDocument.mockResolvedValue({
            $id: "channel1",
            serverId: "server-1",
        });
    });

    it("should return 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?channelId=channel1",
        );

        const response = await GET(request);
        expect(response.status).toBe(401);
    });

    it("should return 403 when caller lacks manageChannels", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: false },
        });

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?channelId=channel1",
        );

        const response = await GET(request);
        expect(response.status).toBe(403);
    });

    it("should return 400 if channelId is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("channelId is required");
    });

    it("should fetch permission overrides for a channel", async () => {
        const mockOverrides = [
            {
                $id: "override1",
                channelId: "channel1",
                roleId: "role1",
                allow: ["readMessages", "sendMessages"],
                deny: [],
            },
        ];

        mockListDocuments.mockResolvedValue({ documents: mockOverrides });

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?channelId=channel1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.overrides).toEqual(mockOverrides);
        expect(mockListDocuments).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.arrayContaining([
                expect.stringContaining("channel1"),
                expect.stringContaining("limit"),
            ]),
        );
    });

    it("should handle errors when fetching overrides", async () => {
        mockListDocuments.mockRejectedValue(new Error("Database error"));

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?channelId=channel1",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to list channel permissions");
    });
});

describe("POST /api/channel-permissions", () => {
    let mockCreateDocument: any;
    let mockListDocuments: any;
    let mockGetDocument: any;

    beforeEach(() => {
        vi.clearAllMocks();
        ensureEnv();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: true },
        });
        const databases = new Databases({} as any);
        mockCreateDocument = databases.createDocument as any;
        mockListDocuments = databases.listDocuments as any;
        mockGetDocument = databases.getDocument as any;
        mockGetDocument.mockResolvedValue({
            $id: "channel1",
            serverId: "server-1",
        });
    });

    it("should return 400 if channelId is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({ roleId: "role1" }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("channelId is required");
    });

    it("should return 400 if neither roleId nor userId is provided", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({ channelId: "channel1" }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Either roleId or userId must be provided");
    });

    it("should return 400 if both roleId and userId are provided", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel1",
                    roleId: "role1",
                    userId: "user1",
                }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Cannot specify both roleId and userId");
    });

    it("should create a permission override with roleId", async () => {
        const mockOverride = {
            $id: "override1",
            channelId: "channel1",
            roleId: "role1",
            allow: ["readMessages"],
            deny: [],
        };

        // Mock listDocuments to return no existing overrides
        mockListDocuments.mockResolvedValue({ documents: [] });
        mockCreateDocument.mockResolvedValue(mockOverride);

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel1",
                    roleId: "role1",
                    allow: ["readMessages"],
                    deny: [],
                }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.override).toEqual(mockOverride);
        expect(mockListDocuments).toHaveBeenCalled();
        expect(mockCreateDocument).toHaveBeenCalled();
    });

    it("should create a permission override with userId", async () => {
        const mockOverride = {
            $id: "override2",
            channelId: "channel1",
            userId: "user1",
            allow: ["sendMessages"],
            deny: ["manageMessages"],
        };

        // Mock listDocuments to return no existing overrides
        mockListDocuments.mockResolvedValue({ documents: [] });
        mockCreateDocument.mockResolvedValue(mockOverride);

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel1",
                    userId: "user1",
                    allow: ["sendMessages"],
                    deny: ["manageMessages"],
                }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.override).toEqual(mockOverride);
    });

    it("should return 400 for invalid permissions", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "POST",
                body: JSON.stringify({
                    channelId: "channel1",
                    roleId: "role1",
                    allow: ["invalidPermission"],
                    deny: [],
                }),
            },
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Invalid permission");
    });
});

describe("PUT /api/channel-permissions", () => {
    let mockUpdateDocument: any;
    let mockGetDocument: any;

    beforeEach(() => {
        vi.clearAllMocks();
        ensureEnv();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: true },
        });
        const databases = new Databases({} as any);
        mockUpdateDocument = databases.updateDocument as any;
        mockGetDocument = databases.getDocument as any;
        mockGetDocument
            .mockResolvedValueOnce({
                $id: "override1",
                channelId: "channel1",
            })
            .mockResolvedValueOnce({
                $id: "channel1",
                serverId: "server-1",
            });
    });

    it("should return 400 if overrideId is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "PUT",
                body: JSON.stringify({ allow: ["readMessages"] }),
            },
        );

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("overrideId is required");
    });

    it("should update a permission override", async () => {
        const mockOverride = {
            $id: "override1",
            channelId: "channel1",
            roleId: "role1",
            allow: ["readMessages", "sendMessages"],
            deny: [],
        };

        mockUpdateDocument.mockResolvedValue(mockOverride);

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
            {
                method: "PUT",
                body: JSON.stringify({
                    overrideId: "override1",
                    allow: ["readMessages", "sendMessages"],
                }),
            },
        );

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.override).toEqual(mockOverride);
        expect(mockUpdateDocument).toHaveBeenCalled();
    });
});

describe("DELETE /api/channel-permissions", () => {
    let mockDeleteDocument: any;
    let mockGetDocument: any;

    beforeEach(() => {
        vi.clearAllMocks();
        ensureEnv();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: true },
        });
        const databases = new Databases({} as any);
        mockDeleteDocument = databases.deleteDocument as any;
        mockGetDocument = databases.getDocument as any;
        mockGetDocument
            .mockResolvedValueOnce({
                $id: "override1",
                channelId: "channel1",
            })
            .mockResolvedValueOnce({
                $id: "channel1",
                serverId: "server-1",
            });
    });

    it("should return 400 if overrideId is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions",
        );

        const response = await DELETE(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("overrideId is required");
    });

    it("should delete a permission override", async () => {
        mockDeleteDocument.mockResolvedValue({});

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?overrideId=override1",
        );

        const response = await DELETE(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockDeleteDocument).toHaveBeenCalled();
    });

    it("should handle errors when deleting", async () => {
        mockDeleteDocument.mockRejectedValue(new Error("Delete failed"));

        const request = new NextRequest(
            "http://localhost:3000/api/channel-permissions?overrideId=override1",
        );

        const response = await DELETE(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to delete channel permission");
    });
});
