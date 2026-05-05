import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockGetEnvConfig,
    mockGetFeatureFlag,
    mockLoggerError,
    mockUpdateVerification,
    mockSetEndpoint,
    mockSetProject,
} = vi.hoisted(() => ({
    mockGetEnvConfig: vi.fn(),
    mockGetFeatureFlag: vi.fn(),
    mockLoggerError: vi.fn(),
    mockUpdateVerification: vi.fn(),
    mockSetEndpoint: vi.fn().mockReturnThis(),
    mockSetProject: vi.fn().mockReturnThis(),
}));

vi.mock("node-appwrite", () => ({
    Account: vi.fn(() => ({
        updateVerification: mockUpdateVerification,
    })),
    Client: vi.fn(() => ({
        setEndpoint: mockSetEndpoint,
        setProject: mockSetProject,
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: mockGetEnvConfig,
}));

vi.mock("@/lib/feature-flags", () => ({
    FEATURE_FLAGS: {
        ENABLE_EMAIL_VERIFICATION: "enable_email_verification",
    },
    getFeatureFlag: mockGetFeatureFlag,
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        error: mockLoggerError,
    },
}));

const { GET } = await import("../../app/api/auth/verify-email/route");

describe("verify-email API route", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetEnvConfig.mockReturnValue({
            endpoint: "https://cloud.appwrite.io/v1",
            project: "firepit",
        });
        mockGetFeatureFlag.mockResolvedValue(true);
        mockUpdateVerification.mockResolvedValue({});
    });

    it("redirects to login when email verification is disabled", async () => {
        mockGetFeatureFlag.mockResolvedValue(false);

        const response = await GET(
            new Request(
                "http://localhost/api/auth/verify-email?userId=user-1&secret=secret-1",
            ),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost/login");
        expect(mockUpdateVerification).not.toHaveBeenCalled();
    });

    it("redirects with verified=0 when parameters are missing", async () => {
        const response = await GET(
            new Request("http://localhost/api/auth/verify-email?userId=user-1"),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/login?verified=0",
        );
        expect(mockUpdateVerification).not.toHaveBeenCalled();
    });

    it("verifies the email and redirects with verified=1", async () => {
        const response = await GET(
            new Request(
                "http://localhost/api/auth/verify-email?userId=user-1&secret=secret-1",
            ),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/login?verified=1",
        );
        expect(mockSetEndpoint).toHaveBeenCalledWith(
            "https://cloud.appwrite.io/v1",
        );
        expect(mockSetProject).toHaveBeenCalledWith("firepit");
        expect(mockUpdateVerification).toHaveBeenCalledWith({
            secret: "secret-1",
            userId: "user-1",
        });
    });

    it("logs and redirects with verified=0 when verification fails", async () => {
        mockUpdateVerification.mockRejectedValue(new Error("verification failed"));

        const response = await GET(
            new Request(
                "http://localhost/api/auth/verify-email?userId=user-1&secret=secret-1",
            ),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/login?verified=0",
        );
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Email verification callback failed",
            expect.objectContaining({
                error: "verification failed",
                hasUserId: true,
            }),
        );
    });
});