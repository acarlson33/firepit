import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
vi.stubEnv("APPWRITE_API_KEY", "test-api-key");
vi.stubEnv("APPWRITE_DATABASE_ID", "test-db");

const {
    mockListDocuments,
    mockGetDocument,
    mockCreateDocument,
    mockUpdateDocument,
    mockDeleteDocument,
    mockGetServerSession,
    mockGetServerPermissionsForUser,
    mockLoggerError,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockGetDocument: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
    mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        error: mockLoggerError,
    },
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "http://localhost/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            categories: "categories",
            channels: "channels",
        },
    })),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            getDocument: mockGetDocument,
            createDocument: mockCreateDocument,
            updateDocument: mockUpdateDocument,
            deleteDocument: mockDeleteDocument,
        },
    })),
}));

vi.mock("node-appwrite", () => ({
    ID: {
        unique: vi.fn(() => "category-new"),
    },
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${JSON.stringify(value)})`,
        limit: (value: number) => `limit(${value})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
    },
}));

describe("Categories API", () => {
    let GET: (request: NextRequest) => Promise<Response>;
    let POST: (request: NextRequest) => Promise<Response>;
    let PUT: (request: NextRequest) => Promise<Response>;
    let DELETE: (request: NextRequest) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: true },
        });

        const module = await import("../../app/api/categories/route");
        GET = module.GET;
        POST = module.POST;
        PUT = module.PUT;
        DELETE = module.DELETE;
    });

    it("returns 400 from GET when serverId is missing", async () => {
        const response = await GET(
            new NextRequest("http://localhost/api/categories"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("serverId");
    });

    it("returns 403 from GET when the caller is not a member", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: false,
            permissions: { manageChannels: false },
        });

        const request = new NextRequest(
            "http://localhost/api/categories?serverId=server-1",
        );
        const response = await GET(request);

        expect(response.status).toBe(403);
    });

    it("lists categories for members", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "category-1",
                    serverId: "server-1",
                    name: "General",
                    position: 0,
                },
            ],
        });

        const request = new NextRequest(
            "http://localhost/api/categories?serverId=server-1",
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.categories).toHaveLength(1);
        expect(data.categories[0].name).toBe("General");
    });

    it("returns 403 from POST when manageChannels is missing", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageChannels: false },
        });

        const response = await POST(
            new NextRequest("http://localhost/api/categories", {
                method: "POST",
                body: JSON.stringify({ serverId: "server-1", name: "Ops" }),
            }),
        );

        expect(response.status).toBe(403);
    });

    it("creates a category at the next position", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "category-2", position: 2 }],
        });
        mockCreateDocument.mockResolvedValue({
            $id: "category-new",
            serverId: "server-1",
            name: "Ops",
            position: 3,
            createdBy: "user-1",
        });

        const response = await POST(
            new NextRequest("http://localhost/api/categories", {
                method: "POST",
                body: JSON.stringify({ serverId: "server-1", name: "Ops" }),
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.category.$id).toBe("category-new");
        expect(mockCreateDocument).toHaveBeenCalledWith(
            "test-db",
            "categories",
            "category-new",
            expect.objectContaining({
                serverId: "server-1",
                name: "Ops",
                createdBy: "user-1",
                position: 3,
            }),
        );
    });

    it("rejects empty names during PUT", async () => {
        mockGetDocument.mockResolvedValue({
            $id: "category-1",
            serverId: "server-1",
        });

        const response = await PUT(
            new NextRequest("http://localhost/api/categories", {
                method: "PUT",
                body: JSON.stringify({ categoryId: "category-1", name: "   " }),
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("cannot be empty");
    });

    it("reassigns linked channels before deleting a category", async () => {
        mockGetDocument.mockResolvedValue({
            $id: "category-1",
            serverId: "server-1",
        });
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "channel-1" }, { $id: "channel-2" }],
        });

        const response = await DELETE(
            new NextRequest(
                "http://localhost/api/categories?categoryId=category-1",
                { method: "DELETE" },
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(mockUpdateDocument).toHaveBeenCalledTimes(2);
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "test-db",
            "channels",
            "channel-1",
            { categoryId: "", position: 0 },
        );
        expect(mockDeleteDocument).toHaveBeenCalledWith(
            "test-db",
            "categories",
            "category-1",
        );
    });
});
