import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";

const { mockDatabases, mockGetFeatureFlag } = vi.hoisted(() => ({
    mockDatabases: {
        listDocuments: vi.fn(),
        createDocument: vi.fn(),
    },
    mockGetFeatureFlag: vi.fn().mockResolvedValue(false),
}));

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
    Account: vi.fn().mockImplementation(() => ({
        createEmailPasswordSession: vi.fn().mockResolvedValue({
            $id: "test-session-id",
            userId: "test-user-id",
            secret: "test-session-secret",
        }),
        createVerification: vi.fn().mockResolvedValue({}),
        deleteSession: vi.fn().mockResolvedValue({}),
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
    Users: vi.fn().mockImplementation(() => ({
        get: vi.fn().mockResolvedValue({
            $id: "test-user-id",
            emailVerification: true,
        }),
    })),
    ID: {
        unique: vi.fn().mockReturnValue("unique-id"),
    },
    Query: {
        equal: (field: string, value: string | boolean) =>
            `equal(${field},${String(value)})`,
        limit: (value: number) => `limit(${String(value)})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
    },
}));

vi.mock("@/lib/feature-flags", () => ({
    FEATURE_FLAGS: {
        ENABLE_EMAIL_VERIFICATION: "enable_email_verification",
    },
    getFeatureFlag: mockGetFeatureFlag,
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
        databases: mockDatabases,
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
        mockDatabases.listDocuments.mockResolvedValue({ documents: [] });
        mockDatabases.createDocument.mockResolvedValue({});
        mockGetFeatureFlag.mockResolvedValue(false);
        process.env.APPWRITE_ENDPOINT = "https://test.appwrite.io";
        process.env.APPWRITE_PROJECT_ID = "test-project";
        process.env.APPWRITE_API_KEY = "test-api-key";
        process.env.SERVER_URL = "http://localhost:3000";
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

    it("loginAction should block the configured system sender account", async () => {
        mockGetFeatureFlag.mockResolvedValue(false);

        process.env.SYSTEM_SENDER_USER_ID = "system-account-id";

        const { Account } = await import("node-appwrite");
        vi.mocked(Account).mockImplementationOnce(
            () =>
                ({
                    createEmailPasswordSession: vi.fn().mockResolvedValue({
                        $id: "system-session-id",
                        secret: "system-session-secret",
                        userId: "system-account-id",
                    }),
                }) as never,
        );

        const { Users } = await import("node-appwrite");
        const mockDeleteSession = vi.fn().mockResolvedValue({});
        vi.mocked(Users).mockImplementationOnce(
            () =>
                ({
                    deleteSession: mockDeleteSession,
                }) as never,
        );

        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "system@example.com");
        formData.set("password", "password123");

        const result = await loginAction(formData);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("reserved for system announcements");
        }
        expect(mockCookieStore.set).not.toHaveBeenCalled();
        expect(mockDeleteSession).toHaveBeenCalledWith({
            userId: "system-account-id",
            sessionId: "system-session-id",
        });
    });

    it("loginAction should require verification when feature flag is enabled and email is unverified", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);

        const { Account, Users } = await import("node-appwrite");
        vi.mocked(Account).mockImplementationOnce(
            () =>
                ({
                    createEmailPasswordSession: vi.fn().mockResolvedValue({
                        $id: "unverified-session-id",
                        userId: "unverified-user-id",
                        secret: "unverified-session-secret",
                    }),
                    createVerification: vi.fn().mockResolvedValue({}),
                    deleteSession: vi.fn().mockResolvedValue({}),
                }) as never,
        );
        vi.mocked(Users).mockImplementationOnce(
            () =>
                ({
                    get: vi.fn().mockResolvedValue({
                        $id: "unverified-user-id",
                        emailVerification: false,
                    }),
                }) as never,
        );

        const { loginAction } = await import("@/app/(auth)/login/actions");

        const formData = new FormData();
        formData.set("email", "unverified@example.com");
        formData.set("password", "password123");

        const result = await loginAction(formData);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.verificationRequired).toBe(true);
            expect(result.error).toContain("verify your email");
        }
        expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it("resendVerificationAction should reject when feature flag is disabled", async () => {
        mockGetFeatureFlag.mockResolvedValue(false);

        const { resendVerificationAction } = await import(
            "@/app/(auth)/login/actions"
        );

        const formData = new FormData();
        formData.set("email", "test@example.com");
        formData.set("password", "password123");

        const result = await resendVerificationAction(formData);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("not enabled");
        }
    });

    it("resendVerificationAction should send email for unverified users", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);

        const createVerification = vi.fn().mockResolvedValue({});
        const deleteSession = vi.fn().mockResolvedValue({});
        const createEmailPasswordSession = vi.fn().mockResolvedValue({
            $id: "unverified-session-id",
            userId: "unverified-user-id",
            secret: "unverified-session-secret",
        });

        const { Account, Users } = await import("node-appwrite");
        vi.mocked(Account)
            .mockImplementationOnce(
                () =>
                    ({
                        createEmailPasswordSession,
                    }) as never,
            )
            .mockImplementationOnce(
                () =>
                    ({
                        createVerification,
                    }) as never,
            );
        vi.mocked(Users).mockImplementationOnce(
            () =>
                ({
                    get: vi.fn().mockResolvedValue({
                        $id: "unverified-user-id",
                        emailVerification: false,
                    }),
                    deleteSession,
                }) as never,
        );

        const { resendVerificationAction } = await import(
            "@/app/(auth)/login/actions"
        );

        const formData = new FormData();
        formData.set("email", "test@example.com");
        formData.set("password", "password123");

        const result = await resendVerificationAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.message).toContain("Verification email sent");
        }
        expect(createEmailPasswordSession).toHaveBeenCalledTimes(1);
        expect(createVerification).toHaveBeenCalledTimes(1);
        expect(createVerification).toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining("/api/auth/verify-email"),
            }),
        );
        expect(deleteSession).toHaveBeenCalledWith({
            userId: "unverified-user-id",
            sessionId: "unverified-session-id",
        });
    });

    it("resendVerificationAction should report already verified users", async () => {
        mockGetFeatureFlag.mockResolvedValue(true);

        const deleteSession = vi.fn().mockResolvedValue({});

        const { Account, Users } = await import("node-appwrite");
        vi.mocked(Account).mockImplementationOnce(
            () =>
                ({
                    createEmailPasswordSession: vi.fn().mockResolvedValue({
                        $id: "verified-session-id",
                        userId: "verified-user-id",
                        secret: "verified-session-secret",
                    }),
                    createVerification: vi.fn().mockResolvedValue({}),
                }) as never,
        );
        vi.mocked(Users).mockImplementationOnce(
            () =>
                ({
                    get: vi.fn().mockResolvedValue({
                        $id: "verified-user-id",
                        emailVerification: true,
                    }),
                    deleteSession,
                }) as never,
        );

        const { resendVerificationAction } = await import(
            "@/app/(auth)/login/actions"
        );

        const formData = new FormData();
        formData.set("email", "verified@example.com");
        formData.set("password", "password123");

        const result = await resendVerificationAction(formData);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.alreadyVerified).toBe(true);
            expect(result.message).toContain("already verified");
        }
        expect(deleteSession).toHaveBeenCalledWith({
            userId: "verified-user-id",
            sessionId: "verified-session-id",
        });
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

    it("registerAction auto-joins configured default signup server", async () => {
        const { registerAction } = await import("@/app/(auth)/login/actions");

        mockDatabases.listDocuments
            .mockResolvedValueOnce({
                documents: [{ $id: "server-default", defaultOnSignup: true }],
            })
            .mockResolvedValueOnce({ documents: [] });

        const formData = new FormData();
        formData.set("email", "newuser@example.com");
        formData.set("password", "securePassword123");
        formData.set("name", "New User");

        const result = await registerAction(formData);

        expect(result.success).toBe(true);
        expect(mockDatabases.createDocument).toHaveBeenCalledWith(
            "test-db",
            "memberships-id",
            "unique-id",
            expect.objectContaining({
                serverId: "server-default",
                role: "member",
            }),
            expect.any(Array),
        );
    });

    it("registerAction does not auto-join when multiple servers and no default exists", async () => {
        const { registerAction } = await import("@/app/(auth)/login/actions");

        mockDatabases.listDocuments
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({
                documents: [{ $id: "server-a" }, { $id: "server-b" }],
            });

        const formData = new FormData();
        formData.set("email", "newuser@example.com");
        formData.set("password", "securePassword123");
        formData.set("name", "New User");

        const result = await registerAction(formData);

        expect(result.success).toBe(true);
        expect(mockDatabases.createDocument).not.toHaveBeenCalled();
    });
});
