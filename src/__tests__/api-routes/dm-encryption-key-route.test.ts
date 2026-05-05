import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const {
    mockGetOrCreateUserProfile,
    mockGetServerSession,
    mockLoggerError,
    mockUpdateUserProfile,
} = vi.hoisted(() => ({
    mockGetOrCreateUserProfile: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockLoggerError: vi.fn(),
    mockUpdateUserProfile: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    getOrCreateUserProfile: mockGetOrCreateUserProfile,
    updateUserProfile: mockUpdateUserProfile,
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        error: mockLoggerError,
    },
}));

const { GET, PATCH } = await import("../../app/api/me/dm-encryption-key/route");

describe("DM encryption key API route", () => {
    const validKey = Buffer.from(new Uint8Array(32)).toString("base64");

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue({
            $id: "user-1",
            name: "Test User",
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 401 when the user is unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns the current DM encryption metadata", async () => {
        mockGetOrCreateUserProfile.mockResolvedValue({
            $id: "profile-1",
            dmEncryptionPublicKey: validKey,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.userId).toBe("user-1");
        expect(data.dmEncryptionPublicKey).toBe(validKey);
        expect(mockGetOrCreateUserProfile).toHaveBeenCalledWith(
            "user-1",
            "Test User",
        );
    });

    it("rejects invalid PATCH bodies", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/me/dm-encryption-key", {
                body: "not-json",
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Invalid JSON body");
        expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    });

    it("rejects invalid encryption keys", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/me/dm-encryption-key", {
                body: JSON.stringify({ dmEncryptionPublicKey: "AAA=" }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("base64");
        expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    });

    it("returns 401 for unauthenticated PATCH requests", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await PATCH(
            new Request("http://localhost/api/me/dm-encryption-key", {
                body: JSON.stringify({ dmEncryptionPublicKey: validKey }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
        expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    });

    it("returns 500 when updating metadata fails", async () => {
        mockGetOrCreateUserProfile.mockResolvedValue({
            $id: "profile-1",
        });
        mockUpdateUserProfile.mockRejectedValue(new Error("db down"));

        const response = await PATCH(
            new Request("http://localhost/api/me/dm-encryption-key", {
                body: JSON.stringify({ dmEncryptionPublicKey: validKey }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Internal server error");
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Failed to update DM encryption key metadata",
            expect.objectContaining({
                error: "db down",
            }),
        );
    });

    it("updates the DM encryption key metadata", async () => {
        mockGetOrCreateUserProfile.mockResolvedValue({
            $id: "profile-1",
            dmEncryptionPublicKey: "old-key",
        });
        mockUpdateUserProfile.mockResolvedValue({
            dmEncryptionPublicKey: validKey,
        });

        const response = await PATCH(
            new Request("http://localhost/api/me/dm-encryption-key", {
                body: JSON.stringify({ dmEncryptionPublicKey: validKey }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.userId).toBe("user-1");
        expect(data.dmEncryptionPublicKey).toBe(validKey);
        expect(mockUpdateUserProfile).toHaveBeenCalledWith("profile-1", {
            dmEncryptionPublicKey: validKey,
        });
    });

    it("returns 500 when fetching metadata fails", async () => {
        mockGetOrCreateUserProfile.mockRejectedValue(new Error("db down"));

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Internal server error");
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Failed to fetch DM encryption key metadata",
            expect.objectContaining({ error: "db down" }),
        );
    });
});