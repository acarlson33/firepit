/**
 * Tests for /api/role-assignments endpoints
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock environment variables before importing the route
vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
vi.stubEnv("APPWRITE_API_KEY", "test-api-key");
vi.stubEnv("APPWRITE_DATABASE_ID", "test-db");

// Create persistent mocks
const {
    mockListDocuments,
    mockCreateDocument,
    mockUpdateDocument,
    mockDeleteDocument,
    mockGetServerSession,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

// Mock dependencies
vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            createDocument: mockCreateDocument,
            updateDocument: mockUpdateDocument,
            deleteDocument: mockDeleteDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "http://localhost/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            roleAssignments: "role-assignments-collection",
            memberships: "memberships-collection",
            profiles: "profiles-collection",
            roles: "roles-collection",
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    Client: vi.fn().mockImplementation(() => ({
        setEndpoint: vi.fn().mockReturnThis(),
        setProject: vi.fn().mockReturnThis(),
        setKey: vi.fn().mockReturnThis(),
    })),
    Databases: vi.fn().mockImplementation(() => ({
        listDocuments: mockListDocuments,
        createDocument: mockCreateDocument,
        updateDocument: mockUpdateDocument,
        deleteDocument: mockDeleteDocument,
    })),
    ID: {
        unique: () => "mock-id",
    },
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${JSON.stringify(value)})`,
        limit: (n: number) => `limit(${n})`,
    },
}));

describe("Role Assignments API", () => {
    let GET: (request: NextRequest) => Promise<Response>;
    let POST: (request: NextRequest) => Promise<Response>;
    let DELETE: (request: NextRequest) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: true },
        });

        // Dynamically import the route handlers
        const module = await import("../../app/api/role-assignments/route");
        GET = module.GET;
        POST = module.POST;
        DELETE = module.DELETE;
    });

    describe("GET /api/role-assignments", () => {
        it("should return 401 when unauthenticated", async () => {
            mockGetServerSession.mockResolvedValue(null);

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("serverId", "server-1");

            const request = new NextRequest(url);
            const response = await GET(request);

            expect(response.status).toBe(401);
        });

        it("should return 403 when caller lacks manageRoles", async () => {
            mockGetServerPermissionsForUser.mockResolvedValue({
                isMember: true,
                permissions: { manageRoles: false },
            });

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("serverId", "server-1");

            const request = new NextRequest(url);
            const response = await GET(request);

            expect(response.status).toBe(403);
        });

        it("should list members with a specific role", async () => {
            mockListDocuments
                .mockResolvedValueOnce({
                    documents: [
                        {
                            $id: "assignment-1",
                            userId: "user-1",
                            serverId: "server-1",
                            roleIds: ["role-1", "role-2"],
                        },
                        {
                            $id: "assignment-2",
                            userId: "user-2",
                            serverId: "server-1",
                            roleIds: ["role-1"],
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    documents: [
                        {
                            $id: "profile-1",
                            userId: "user-1",
                            displayName: "User One",
                            userName: "userone",
                        },
                        {
                            $id: "profile-2",
                            userId: "user-2",
                            displayName: "User Two",
                            userName: "usertwo",
                        },
                    ],
                });

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("serverId", "server-1");
            url.searchParams.set("roleId", "role-1");

            const request = new NextRequest(url);
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.members).toHaveLength(2);
            expect(data.members[0].userId).toBe("user-1");
            expect(data.members[0].displayName).toBe("User One");
        });

        it("should get roles for a specific user", async () => {
            mockListDocuments.mockResolvedValue({
                documents: [
                    {
                        $id: "assignment-1",
                        userId: "user-1",
                        serverId: "server-1",
                        roleIds: ["role-1", "role-2"],
                    },
                ],
            });

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("serverId", "server-1");
            url.searchParams.set("userId", "user-1");

            const request = new NextRequest(url);
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.assignments).toBeDefined();
            expect(data.assignments[0].roleIds).toEqual(["role-1", "role-2"]);
        });

        it("should return 400 if serverId is missing", async () => {
            const url = new URL("http://localhost/api/role-assignments");
            const request = new NextRequest(url);
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain("serverId");
        });
    });

    describe("POST /api/role-assignments", () => {
        it("should assign a role to a user", async () => {
            // Mock membership check
            mockListDocuments.mockResolvedValueOnce({
                documents: [{ userId: "user-1", serverId: "server-1" }],
            });

            // Mock existing assignment check
            mockListDocuments.mockResolvedValueOnce({
                documents: [],
            });

            // Mock role member count query
            mockListDocuments.mockResolvedValueOnce({
                documents: [],
            });

            mockCreateDocument.mockResolvedValue({
                $id: "assignment-1",
                userId: "user-1",
                serverId: "server-1",
                roleIds: ["role-1"],
            });

            const request = new NextRequest(
                "http://localhost/api/role-assignments",
                {
                    method: "POST",
                    body: JSON.stringify({
                        userId: "user-1",
                        serverId: "server-1",
                        roleId: "role-1",
                    }),
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.assignment).toBeDefined();
            expect(mockCreateDocument).toHaveBeenCalled();
        });

        it("should add role to existing assignment", async () => {
            // Mock membership check
            mockListDocuments.mockResolvedValueOnce({
                documents: [{ userId: "user-1", serverId: "server-1" }],
            });

            // Mock existing assignment with different role
            mockListDocuments.mockResolvedValueOnce({
                documents: [
                    {
                        $id: "assignment-1",
                        userId: "user-1",
                        serverId: "server-1",
                        roleIds: ["role-2"],
                    },
                ],
            });

            // Mock role member count query
            mockListDocuments.mockResolvedValueOnce({
                documents: [],
            });

            mockUpdateDocument.mockResolvedValue({
                $id: "assignment-1",
                userId: "user-1",
                serverId: "server-1",
                roleIds: ["role-2", "role-1"],
            });

            const request = new NextRequest(
                "http://localhost/api/role-assignments",
                {
                    method: "POST",
                    body: JSON.stringify({
                        userId: "user-1",
                        serverId: "server-1",
                        roleId: "role-1",
                    }),
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(mockUpdateDocument).toHaveBeenCalled();
        });

        it("should return 400 if user is not a member", async () => {
            mockListDocuments.mockResolvedValue({
                documents: [],
            });

            const request = new NextRequest(
                "http://localhost/api/role-assignments",
                {
                    method: "POST",
                    body: JSON.stringify({
                        userId: "user-1",
                        serverId: "server-1",
                        roleId: "role-1",
                    }),
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain("not a member");
        });

        it("should return 400 if required fields are missing", async () => {
            const request = new NextRequest(
                "http://localhost/api/role-assignments",
                {
                    method: "POST",
                    body: JSON.stringify({
                        userId: "user-1",
                    }),
                },
            );

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain("required");
        });
    });

    describe("DELETE /api/role-assignments", () => {
        it("should remove a role from user", async () => {
            mockListDocuments
                .mockResolvedValueOnce({
                    documents: [
                        {
                            $id: "assignment-1",
                            userId: "user-1",
                            serverId: "server-1",
                            roleIds: ["role-1", "role-2"],
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    documents: [],
                });

            mockUpdateDocument.mockResolvedValue({
                $id: "assignment-1",
                userId: "user-1",
                serverId: "server-1",
                roleIds: ["role-2"],
            });

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("userId", "user-1");
            url.searchParams.set("serverId", "server-1");
            url.searchParams.set("roleId", "role-1");

            const request = new NextRequest(url, { method: "DELETE" });
            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockUpdateDocument).toHaveBeenCalled();
        });

        it("should delete assignment if last role removed", async () => {
            mockListDocuments
                .mockResolvedValueOnce({
                    documents: [
                        {
                            $id: "assignment-1",
                            userId: "user-1",
                            serverId: "server-1",
                            roleIds: ["role-1"],
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    documents: [],
                });

            mockDeleteDocument.mockResolvedValue({});

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("userId", "user-1");
            url.searchParams.set("serverId", "server-1");
            url.searchParams.set("roleId", "role-1");

            const request = new NextRequest(url, { method: "DELETE" });
            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockDeleteDocument).toHaveBeenCalled();
        });

        it("should return 404 if assignment not found", async () => {
            mockListDocuments.mockResolvedValue({
                documents: [],
            });

            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("userId", "user-1");
            url.searchParams.set("serverId", "server-1");
            url.searchParams.set("roleId", "role-1");

            const request = new NextRequest(url, { method: "DELETE" });
            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toContain("not found");
        });

        it("should return 400 if required parameters are missing", async () => {
            const url = new URL("http://localhost/api/role-assignments");
            url.searchParams.set("userId", "user-1");

            const request = new NextRequest(url, { method: "DELETE" });
            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain("required");
        });
    });
});
