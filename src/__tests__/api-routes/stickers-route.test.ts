import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

class MockAuthError extends Error {
    readonly code: "UNAUTHORIZED" | "FORBIDDEN";

    constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message?: string) {
        super(message ?? (code === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden"));
        this.name = "AuthError";
        this.code = code;
    }
}

const {
    mockGetBuiltinStickerPacks,
    mockRequireAuth,
    mockSetTransactionName,
    mockTrackApiCall,
} = vi.hoisted(() => ({
    mockGetBuiltinStickerPacks: vi.fn(),
    mockRequireAuth: vi.fn(),
    mockSetTransactionName: vi.fn(),
    mockTrackApiCall: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    AuthError: MockAuthError,
    requireAuth: mockRequireAuth,
}));

vi.mock("@/lib/gif-sticker", () => ({
    getBuiltinStickerPacks: mockGetBuiltinStickerPacks,
}));

vi.mock("@/lib/newrelic-utils", () => ({
    setTransactionName: mockSetTransactionName,
    trackApiCall: mockTrackApiCall,
}));

const { GET } = await import("../../app/api/stickers/route");

describe("stickers API route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue({ $id: "user-1" });
        mockGetBuiltinStickerPacks.mockReturnValue([
            {
                id: "starter",
                items: [
                    {
                        id: "wave",
                        mediaUrl: "https://example.com/wave.png",
                        name: "Wave",
                        packId: "starter",
                        source: "builtin_sticker",
                    },
                ],
                name: "Starter Stickers",
                description: "Starter pack",
                source: "builtin",
            },
            {
                id: "party",
                items: [
                    {
                        id: "confetti",
                        mediaUrl: "https://example.com/confetti.png",
                        name: "Confetti",
                        packId: "party",
                        source: "builtin_sticker",
                    },
                ],
                name: "Party Stickers",
                description: "Party pack",
                source: "builtin",
            },
        ]);
    });

    it("returns 401 when the caller is unauthenticated", async () => {
        mockRequireAuth.mockRejectedValue(new MockAuthError("UNAUTHORIZED"));

        const response = await GET(
            new NextRequest("http://localhost/api/stickers"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/stickers",
            "GET",
            401,
            expect.any(Number),
        );
    });

    it("returns only the requested sticker pack", async () => {
        const response = await GET(
            new NextRequest("http://localhost/api/stickers?packId=party"),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.packs).toHaveLength(1);
        expect(data.packs[0].id).toBe("party");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/stickers",
            "GET",
            200,
            expect.any(Number),
            expect.objectContaining({
                itemCount: 1,
                packCount: 1,
            }),
        );
    });

    it("returns 500 when auth fails", async () => {
        mockRequireAuth.mockRejectedValue(new Error("boom"));

        const response = await GET(
            new NextRequest("http://localhost/api/stickers"),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to list stickers");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/stickers",
            "GET",
            500,
            expect.any(Number),
        );
    });
});