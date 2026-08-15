import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockCheckRateLimit,
    mockCreateEmailPasswordSession,
    mockGetClientIp,
} = vi.hoisted(() => ({
    mockCheckRateLimit: vi.fn(),
    mockCreateEmailPasswordSession: vi.fn(),
    mockGetClientIp: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Account: class {
        createEmailPasswordSession = mockCreateEmailPasswordSession;
    },
    Client: class {
        setEndpoint = vi.fn().mockReturnThis();
        setProject = vi.fn().mockReturnThis();
        setKey = vi.fn().mockReturnThis();
    },
}));

vi.mock("@/lib/auth-server", () => ({
    debugAuth: vi.fn(),
    describeAuthHeader: vi.fn(() => "(mock)"),
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: mockCheckRateLimit,
    getClientIp: mockGetClientIp,
}));

import { POST } from "@/app/api/auth/session/route";

function allowAll() {
    mockCheckRateLimit.mockReturnValue({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 60_000,
        retryAfter: undefined,
    });
    mockGetClientIp.mockReturnValue("203.0.113.10");
}

describe("POST /api/auth/session", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        allowAll();
    });

    it("creates a session and returns the secret and userId", async () => {
        mockCreateEmailPasswordSession.mockResolvedValue({
            userId: "user-1",
            secret: "secret-1",
        });

        const response = await POST(
            new Request("http://localhost/api/auth/session", {
                method: "POST",
                body: JSON.stringify({
                    email: "user@example.com",
                    password: "correct-horse",
                }),
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({
            success: true,
            session: "secret-1",
            userId: "user-1",
        });
        expect(mockCreateEmailPasswordSession).toHaveBeenCalledWith({
            email: "user@example.com",
            password: "correct-horse",
        });
    });

    it("returns a generic credential error without leaking the Appwrite message", async () => {
        const appwriteError = new Error(
            "Invalid credentials. Please check the email and password.",
        ) as Error & { code: number };
        appwriteError.code = 401;
        mockCreateEmailPasswordSession.mockRejectedValue(appwriteError);

        const response = await POST(
            new Request("http://localhost/api/auth/session", {
                method: "POST",
                body: JSON.stringify({
                    email: "user@example.com",
                    password: "wrong-password",
                }),
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Invalid email or password");
    });

    it("returns 429 when the per-email rate limit is exceeded", async () => {
        mockCheckRateLimit.mockImplementation((identifier: string) =>
            identifier.startsWith("session-login-email:")
                ? {
                      allowed: false,
                      remaining: 0,
                      resetAt: Date.now() + 60_000,
                      retryAfter: 42,
                  }
                : {
                      allowed: true,
                      remaining: 5,
                      resetAt: Date.now() + 60_000,
                      retryAfter: undefined,
                  },
        );

        const response = await POST(
            new Request("http://localhost/api/auth/session", {
                method: "POST",
                body: JSON.stringify({
                    email: "user@example.com",
                    password: "wrong-password",
                }),
            }),
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("42");
        expect(mockCreateEmailPasswordSession).not.toHaveBeenCalled();
    });

    it("returns 429 when the per-IP rate limit is exceeded", async () => {
        mockCheckRateLimit.mockImplementation((identifier: string) =>
            identifier.startsWith("session-login-ip:")
                ? {
                      allowed: false,
                      remaining: 0,
                      resetAt: Date.now() + 60_000,
                      retryAfter: 60,
                  }
                : {
                      allowed: true,
                      remaining: 5,
                      resetAt: Date.now() + 60_000,
                      retryAfter: undefined,
                  },
        );

        const response = await POST(
            new Request("http://localhost/api/auth/session", {
                method: "POST",
                body: JSON.stringify({
                    email: "user@example.com",
                    password: "wrong-password",
                }),
            }),
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("60");
        expect(mockCreateEmailPasswordSession).not.toHaveBeenCalled();
    });
});
