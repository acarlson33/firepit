import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
    Account: vi.fn().mockImplementation(() => ({
        createEmailPasswordSession: vi.fn().mockResolvedValue({
            userId: "test-user-id",
            secret: "test-session-secret",
        }),
        create: vi.fn().mockResolvedValue({
            $id: "test-user-id",
            email: "test@example.com",
            name: "Test User",
        }),
    })),
    Client: vi.fn().mockImplementation(() => ({
        setEndpoint: vi.fn().mockReturnThis(),
        setProject: vi.fn().mockReturnThis(),
        setKey: vi.fn().mockReturnThis(),
        setSession: vi.fn().mockReturnThis(),
    })),
    ID: {
        unique: vi.fn().mockReturnValue("unique-id"),
    },
    Query: {},
}));

// Mock next/headers
vi.mock("next/headers", () => ({
    cookies: vi.fn(),
}));

// Mock appwrite-core
vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn().mockReturnValue({
        endpoint: "https://test.appwrite.io",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            servers: "servers-id",
            memberships: "memberships-id",
        },
    }),
    perms: {
        serverOwner: vi.fn().mockReturnValue([]),
    },
}));

// Mock appwrite-server
vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn().mockReturnValue({
        databases: {
            listDocuments: vi.fn().mockResolvedValue({
                documents: [],
            }),
            createDocument: vi.fn().mockResolvedValue({}),
        },
    }),
}));

describe("Login Security", () => {
    const mockCookieStore = {
        set: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(cookies).mockResolvedValue(mockCookieStore as never);
        process.env.APPWRITE_ENDPOINT = "https://test.appwrite.io";
        process.env.APPWRITE_PROJECT_ID = "test-project";
        process.env.APPWRITE_API_KEY = "test-api-key";
    });

    it("loginAction should accept FormData instead of plain parameters", async () => {
        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "test@example.com");
        formData.set("password", "securePassword123");

        const result = await loginAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.userId).toBe("test-user-id");
        }
        expect(mockCookieStore.set).toHaveBeenCalledWith(
            "a_session_test-project",
            "test-session-secret",
            expect.objectContaining({
                httpOnly: true,
                sameSite: "lax",
                path: "/",
            }),
        );
    });

    it("loginAction should validate required fields", async () => {
        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        // Missing email and password

        const result = await loginAction(formData);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("required");
        }
    });

    it("registerAction should accept FormData instead of plain parameters", async () => {
        const { registerAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "newuser@example.com");
        formData.set("password", "securePassword123");
        formData.set("name", "New User");

        const result = await registerAction(formData);

        // Should succeed (registration + login)
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.userId).toBe("test-user-id");
        }
    });

    it("registerAction should validate required fields", async () => {
        const { registerAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("name", "Test User");
        // Missing email and password

        const result = await registerAction(formData);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("required");
        }
    });

    it("loginAction should set secure cookie flags", async () => {
        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "test@example.com");
        formData.set("password", "password123");

        await loginAction(formData);

        expect(mockCookieStore.set).toHaveBeenCalledWith(
            expect.stringContaining("a_session_"),
            expect.any(String),
            expect.objectContaining({
                httpOnly: true,
                sameSite: "lax",
            }),
        );
    });

    it("loginAction should handle errors gracefully without throwing", async () => {
        // Clear previous mocks and simulate an error
        vi.clearAllMocks();

        const { Account } = await import("node-appwrite");
        vi.mocked(Account).mockImplementationOnce(
            () =>
                ({
                    createEmailPasswordSession: vi
                        .fn()
                        .mockRejectedValue(new Error("Invalid credentials")),
                }) as never,
        );

        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "test@example.com");
        formData.set("password", "wrongpassword");

        const result = await loginAction(formData);

        // Should return error response instead of throwing
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("Invalid");
        }
    });

    it("registerAction should handle errors gracefully without throwing", async () => {
        // Clear previous mocks and simulate an error
        vi.clearAllMocks();

        const { Account } = await import("node-appwrite");
        vi.mocked(Account).mockImplementationOnce(
            () =>
                ({
                    create: vi
                        .fn()
                        .mockRejectedValue(new Error("User already exists")),
                }) as never,
        );

        const { registerAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "existing@example.com");
        formData.set("password", "password123");
        formData.set("name", "Test User");

        const result = await registerAction(formData);

        // Should return error response instead of throwing
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("exists");
        }
    });
});
