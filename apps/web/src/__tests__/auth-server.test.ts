import { describe, expect, it, vi, beforeEach } from "vitest";

// Setup environment before any imports
const env = process.env as Record<string, string>;
env.APPWRITE_ENDPOINT = "http://localhost";
env.APPWRITE_PROJECT_ID = "test-project";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
    Client: class MockClient {
        __mockAuthMode: "jwt" | "session" | null = null;
        setEndpoint() {
            return this;
        }
        setProject() {
            return this;
        }
        setJWT() {
            this.__mockAuthMode = "jwt";
            return this;
        }
        setSession() {
            this.__mockAuthMode = "session";
            return this;
        }
    },
    Account: class MockAccount {
        authMode: "jwt" | "session" | null = null;
        constructor(client?: MockClient) {
            this.authMode = client?.__mockAuthMode ?? null;
        }
        async get() {
            const modeResponses = (globalThis as any).__mockAuthModeResponses;
            if (
                modeResponses &&
                this.authMode &&
                this.authMode in modeResponses
            ) {
                const modeResponse = modeResponses[this.authMode];
                if (modeResponse === null || modeResponse === undefined) {
                    throw new Error("No session");
                }
                return modeResponse;
            }
            const mockUser = (globalThis as any).__mockAuthUser;
            if (mockUser === null || mockUser === undefined) {
                throw new Error("No session");
            }
            return mockUser;
        }
    },
}));

// Mock next/headers
vi.mock("next/headers", () => ({
    headers: async () => {
        const mockHeaders = (globalThis as any).__mockHeaders || {};
        return {
            get: (name: string) =>
                mockHeaders[name] || mockHeaders[name.toLowerCase()] || null,
        };
    },
    cookies: async () => {
        const mockCookies = (globalThis as any).__mockCookies || {};
        return {
            get: (name: string) => mockCookies[name] || null,
        };
    },
}));

// Mock appwrite-core to return dynamic env values (avoiding cache from .env.local)
vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: () => ({
        endpoint: process.env.APPWRITE_ENDPOINT || "",
        project: process.env.APPWRITE_PROJECT_ID || "",
        databaseId: "test-db",
        collections: {},
        buckets: {},
        teams: {},
    }),
}));

// Mock appwrite-roles with dynamic function to access global state
vi.mock("../lib/appwrite-roles", () => ({
    getUserRoles: vi.fn(async (userId: string) => {
        const mockRoles = (globalThis as any).__mockUserRoles || {};
        return mockRoles[userId] || { isAdmin: false, isModerator: false };
    }),
}));

function setMockUser(
    user: { $id: string; name: string; email: string } | null,
) {
    (globalThis as any).__mockAuthUser = user;
}

function setMockCookies(cookies: Record<string, { value: string }>) {
    (globalThis as any).__mockCookies = cookies;
}

function setMockHeaders(headers: Record<string, string>) {
    (globalThis as any).__mockHeaders = headers;
}

function setMockUserRoles(
    userId: string,
    roles: { isAdmin: boolean; isModerator: boolean },
) {
    const mockRoles = ((globalThis as any).__mockUserRoles ||= {});
    mockRoles[userId] = roles;
}

function setMockAuthModeResponse(
    mode: "jwt" | "session",
    user: { $id: string; name: string; email: string } | null,
) {
    const modeResponses = ((globalThis as any).__mockAuthModeResponses ||= {});
    modeResponses[mode] = user;
}

function clearMocks() {
    (globalThis as any).__mockAuthUser = undefined;
    (globalThis as any).__mockCookies = {};
    (globalThis as any).__mockHeaders = {};
    (globalThis as any).__mockUserRoles = {};
    (globalThis as any).__mockAuthModeResponses = undefined;
}

function clearEnvVar(envName: string) {
    Reflect.deleteProperty(process.env, envName);
}

describe("auth-server", () => {
    beforeEach(() => {
        clearMocks();
        // Reset the module registry so the auth-server session cache is fresh
        // for each test (otherwise cached sessions leak across tests).
        vi.resetModules();
        // Reset env vars
        const env = process.env as Record<string, string>;
        env.APPWRITE_ENDPOINT = "http://localhost";
        env.APPWRITE_PROJECT_ID = "test-project";
        clearEnvVar("SYSTEM_SENDER_USER_ID");
    });

    describe("getServerSession", () => {
        it("should return null when no endpoint configured", async () => {
            clearEnvVar("APPWRITE_ENDPOINT");

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should return null when no project configured", async () => {
            clearEnvVar("APPWRITE_PROJECT_ID");

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should return null when no session cookie exists", async () => {
            setMockCookies({});

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should not mistake a Basic auth scheme for a token", async () => {
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };
            setMockUser(mockUser);
            setMockHeaders({ Authorization: "Basic dXNlcjpwYXNzd29yZA==" });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should prefer a Bearer token over other comma-joined schemes", async () => {
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };
            setMockUser(mockUser);
            setMockHeaders({
                Authorization: "Basic dXNlcjpwYXNz, Bearer session-token-123",
            });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should return user when bearer session token exists", async () => {
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };

            setMockUser(mockUser);
            setMockHeaders({ Authorization: "Bearer session-token-123" });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should return user from x-firepit-token header", async () => {
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };

            setMockUser(mockUser);
            setMockHeaders({ "x-firepit-token": "session-token-123" });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should prefer x-firepit-token over edge-clobbered Authorization", async () => {
            // Appwrite Cloud's edge rewrites Authorization to its operator
            // credential; the token survives in x-firepit-token instead.
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };

            setMockUser(mockUser);
            setMockHeaders({
                Authorization: "Basic dXNlcjpwYXNzd29yZA==",
                "x-firepit-token": "session-token-123",
            });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should return user when bearer jwt token exists", async () => {
            const mockUser = {
                $id: "user456",
                name: "JWT User",
                email: "jwt@example.com",
            };

            setMockUser(mockUser);
            setMockHeaders({
                Authorization: "Bearer header.payload.signature",
            });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should fall back to session auth for jwt-like session tokens", async () => {
            const mockUser = {
                $id: "user789",
                name: "Session Secret User",
                email: "session@example.com",
            };

            // Appwrite session secrets are JWT-shaped (three dot-separated
            // segments). JWT auth fails for them; the session fallback must
            // still be attempted even though jwt auth was tried and failed.
            setMockHeaders({
                Authorization: "Bearer header.payload.signature",
            });
            setMockAuthModeResponse("jwt", null);
            setMockAuthModeResponse("session", mockUser);

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should not let a failed jwt attempt poison the session fallback cache", async () => {
            const mockUser = {
                $id: "user999",
                name: "Recovered User",
                email: "recovered@example.com",
            };

            setMockHeaders({
                Authorization: "Bearer header.payload.signature",
            });
            setMockAuthModeResponse("jwt", null);
            setMockAuthModeResponse("session", mockUser);

            const { getServerSession } = await import("../lib/auth-server");

            const firstAttempt = await getServerSession();
            expect(firstAttempt).toEqual(mockUser);

            // Second request (cache hit for jwt, fresh cache hit for session)
            // must still resolve the user.
            const secondAttempt = await getServerSession();
            expect(secondAttempt).toEqual(mockUser);
        });

        it("should return user when valid session exists", async () => {
            const mockUser = {
                $id: "user123",
                name: "Test User",
                email: "test@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-session-token" },
            });

            const { getServerSession } = await import("../lib/auth-server");
            const session = await getServerSession();
            expect(session).toEqual(mockUser);
        });

        it("should return null when session is invalid", async () => {
            setMockUser(null);
            setMockCookies({
                "a_session_test-project": { value: "invalid-token" },
            });

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should handle account.get() errors gracefully", async () => {
            setMockUser(null); // Will throw error
            setMockCookies({
                "a_session_test-project": { value: "some-token" },
            });

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });

        it("should return null when session belongs to configured system sender", async () => {
            const env = process.env as Record<string, string>;
            env.SYSTEM_SENDER_USER_ID = "system-account";

            setMockUser({
                $id: "system-account",
                name: "System",
                email: "system@example.com",
            });
            setMockCookies({
                "a_session_test-project": { value: "valid-session-token" },
            });

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toBeNull();
        });
    });

    describe("checkUserRoles", () => {
        it("should return user roles", async () => {
            setMockUserRoles("admin-user", {
                isAdmin: true,
                isModerator: true,
            });

            const { checkUserRoles } = await import("../lib/auth-server");

            const roles = await checkUserRoles("admin-user");
            expect(roles.isAdmin).toBe(true);
            expect(roles.isModerator).toBe(true);
        });

        it("should return false roles for regular user", async () => {
            setMockUserRoles("regular-user", {
                isAdmin: false,
                isModerator: false,
            });

            const { checkUserRoles } = await import("../lib/auth-server");

            const roles = await checkUserRoles("regular-user");
            expect(roles.isAdmin).toBe(false);
            expect(roles.isModerator).toBe(false);
        });
    });

    describe("requireAuth", () => {
        it("should throw when no session exists", async () => {
            setMockUser(null);
            setMockCookies({});

            const { requireAuth } = await import("../lib/auth-server");

            await expect(requireAuth()).rejects.toThrow("Unauthorized");
        });

        it("should return user when session exists", async () => {
            const mockUser = {
                $id: "user456",
                name: "Authenticated User",
                email: "auth@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });

            const { requireAuth } = await import("../lib/auth-server");

            const user = await requireAuth();
            expect(user).toEqual(mockUser);
        });
    });

    describe("requireAdmin", () => {
        it("should throw when user is not authenticated", async () => {
            setMockUser(null);
            setMockCookies({});

            const { requireAdmin } = await import("../lib/auth-server");

            await expect(requireAdmin()).rejects.toThrow("Unauthorized");
        });

        it("should throw when user is not admin", async () => {
            const mockUser = {
                $id: "regular-user",
                name: "Regular User",
                email: "regular@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });
            setMockUserRoles("regular-user", {
                isAdmin: false,
                isModerator: false,
            });

            const { requireAdmin } = await import("../lib/auth-server");

            await expect(requireAdmin()).rejects.toThrow(
                "Forbidden: Admin access required",
            );
        });

        it("should return user and roles when user is admin", async () => {
            const mockUser = {
                $id: "admin-user",
                name: "Admin User",
                email: "admin@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });
            setMockUserRoles("admin-user", {
                isAdmin: true,
                isModerator: true,
            });

            const { requireAdmin } = await import("../lib/auth-server");

            const result = await requireAdmin();
            expect(result.user).toEqual(mockUser);
            expect(result.roles.isAdmin).toBe(true);
            expect(result.roles.isModerator).toBe(true);
        });
    });

    describe("requireModerator", () => {
        it("should throw when user is not authenticated", async () => {
            setMockUser(null);
            setMockCookies({});

            const { requireModerator } = await import("../lib/auth-server");

            await expect(requireModerator()).rejects.toThrow("Unauthorized");
        });

        it("should throw when user is neither moderator nor admin", async () => {
            const mockUser = {
                $id: "regular-user",
                name: "Regular User",
                email: "regular@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });
            setMockUserRoles("regular-user", {
                isAdmin: false,
                isModerator: false,
            });

            const { requireModerator } = await import("../lib/auth-server");

            await expect(requireModerator()).rejects.toThrow(
                "Forbidden: Moderator access required",
            );
        });

        it("should return user and roles when user is moderator", async () => {
            const mockUser = {
                $id: "mod-user",
                name: "Mod User",
                email: "mod@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });
            setMockUserRoles("mod-user", { isAdmin: false, isModerator: true });

            const { requireModerator } = await import("../lib/auth-server");

            const result = await requireModerator();
            expect(result.user).toEqual(mockUser);
            expect(result.roles.isModerator).toBe(true);
        });

        it("should return user and roles when user is admin", async () => {
            const mockUser = {
                $id: "admin-user",
                name: "Admin User",
                email: "admin@example.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "valid-token" },
            });
            setMockUserRoles("admin-user", {
                isAdmin: true,
                isModerator: true,
            });

            const { requireModerator } = await import("../lib/auth-server");

            const result = await requireModerator();
            expect(result.user).toEqual(mockUser);
            expect(result.roles.isAdmin).toBe(true);
            expect(result.roles.isModerator).toBe(true);
        });
    });

    describe("Edge Cases", () => {
        it("should handle malformed user object", async () => {
            setMockUser({ $id: "test", name: "", email: "" });
            setMockCookies({
                "a_session_test-project": { value: "token" },
            });

            const { getServerSession } = await import("../lib/auth-server");

            const session = await getServerSession();
            expect(session).toHaveProperty("$id");
        });

        it("should handle concurrent requireAdmin calls", async () => {
            const mockUser = {
                $id: "admin",
                name: "Admin",
                email: "admin@test.com",
            };

            setMockUser(mockUser);
            setMockCookies({
                "a_session_test-project": { value: "token" },
            });
            setMockUserRoles("admin", { isAdmin: true, isModerator: true });

            const { requireAdmin } = await import("../lib/auth-server");

            const results = await Promise.all([
                requireAdmin(),
                requireAdmin(),
                requireAdmin(),
            ]);

            expect(results).toHaveLength(3);
            results.forEach((result) => {
                expect(result.roles.isAdmin).toBe(true);
            });
        });
    });
});
