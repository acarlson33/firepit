import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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
    mockCheckRateLimit,
    mockLoggerError,
    mockLoggerWarn,
    mockRequireAuth,
    mockSetTransactionName,
    mockTrackApiCall,
} = vi.hoisted(() => ({
    mockCheckRateLimit: vi.fn(),
    mockLoggerError: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockRequireAuth: vi.fn(),
    mockSetTransactionName: vi.fn(),
    mockTrackApiCall: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    AuthError: MockAuthError,
    requireAuth: mockRequireAuth,
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        error: mockLoggerError,
        warn: mockLoggerWarn,
    },
    setTransactionName: mockSetTransactionName,
    trackApiCall: mockTrackApiCall,
}));

vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: mockCheckRateLimit,
}));

const originalEnv = {
    GIF_PROVIDER: process.env.GIF_PROVIDER,
    GIPHY_API_KEY: process.env.GIPHY_API_KEY,
    GIPHY_LANG: process.env.GIPHY_LANG,
    GIPHY_RATING: process.env.GIPHY_RATING,
    TENOR_API_KEY: process.env.TENOR_API_KEY,
    TENOR_CLIENT_KEY: process.env.TENOR_CLIENT_KEY,
    TENOR_LOCALE: process.env.TENOR_LOCALE,
};

const { GET } = await import("../../app/api/gifs/search/route");

describe("GIF search API route", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        process.env.GIF_PROVIDER = "";
        process.env.GIPHY_API_KEY = "";
        process.env.GIPHY_LANG = "";
        process.env.GIPHY_RATING = "";
        process.env.TENOR_API_KEY = "";
        process.env.TENOR_CLIENT_KEY = "";
        process.env.TENOR_LOCALE = "";

        mockRequireAuth.mockResolvedValue({ $id: "user-1" });
        mockCheckRateLimit.mockReturnValue({ allowed: true });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env.GIF_PROVIDER = originalEnv.GIF_PROVIDER ?? "";
        process.env.GIPHY_API_KEY = originalEnv.GIPHY_API_KEY ?? "";
        process.env.GIPHY_LANG = originalEnv.GIPHY_LANG ?? "";
        process.env.GIPHY_RATING = originalEnv.GIPHY_RATING ?? "";
        process.env.TENOR_API_KEY = originalEnv.TENOR_API_KEY ?? "";
        process.env.TENOR_CLIENT_KEY = originalEnv.TENOR_CLIENT_KEY ?? "";
        process.env.TENOR_LOCALE = originalEnv.TENOR_LOCALE ?? "";
    });

    it("returns 401 when the caller is not authenticated", async () => {
        mockRequireAuth.mockRejectedValue(new MockAuthError("UNAUTHORIZED"));

        const response = await GET(
            new NextRequest("http://localhost/api/gifs/search?q=wave"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/gifs/search",
            "GET",
            401,
            expect.any(Number),
        );
    });

    it("returns 400 for invalid search parameters", async () => {
        const response = await GET(
            new NextRequest("http://localhost/api/gifs/search"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("Query parameter q is required");
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/gifs/search",
            "GET",
            400,
            expect.any(Number),
        );
    });

    it("returns 429 when the rate limit is exceeded", async () => {
        mockCheckRateLimit.mockReturnValue({
            allowed: false,
            retryAfter: 45,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/gifs/search?q=wave"),
        );
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("45");
        expect(data.error).toBe("Too many GIF searches. Please try again shortly.");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("searches Giphy and normalizes the results", async () => {
        process.env.GIPHY_API_KEY = "giphy-key";

        mockFetch.mockResolvedValue(
            new Response(
                JSON.stringify({
                    data: [
                        {
                            id: "gif-1",
                            images: {
                                downsized_still: {
                                    url: "https://cdn.example.com/gif-1-preview.gif",
                                },
                                original: {
                                    height: "200",
                                    url: "https://cdn.example.com/gif-1.gif",
                                    width: "320",
                                },
                            },
                            title: "wave",
                        },
                    ],
                    pagination: {
                        count: 1,
                        offset: 0,
                        total_count: 10,
                    },
                }),
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                    status: 200,
                },
            ),
        );

        const response = await GET(
            new NextRequest("http://localhost/api/gifs/search?q=wave&limit=1"),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].id).toBe("gif-1");
        expect(data.items[0].source).toBe("giphy");
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const request = mockFetch.mock.calls[0]?.[0] as URL;
        expect(request.toString()).toContain("api.giphy.com/v1/gifs/search");
        expect(request.searchParams.get("api_key")).toBe("giphy-key");
        expect(request.searchParams.get("q")).toBe("wave");
        expect(request.searchParams.get("limit")).toBe("1");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/gifs/search",
            "GET",
            200,
            expect.any(Number),
            expect.objectContaining({
                itemCount: 1,
                provider: "giphy",
                queryLength: 4,
            }),
        );
    });

    it("searches Tenor and normalizes the results", async () => {
        process.env.GIF_PROVIDER = "tenor";
        process.env.TENOR_API_KEY = "tenor-key";
        process.env.TENOR_CLIENT_KEY = "client-key";
        process.env.TENOR_LOCALE = "en_GB";

        mockFetch.mockResolvedValue(
            new Response(
                JSON.stringify({
                    next: "next-token",
                    results: [
                        {
                            content_description: "party",
                            id: "tenor-1",
                            media_formats: {
                                gif: {
                                    dims: [240, 180],
                                    duration: 1.25,
                                    url: "https://cdn.example.com/tenor-1.gif",
                                },
                                tinygifpreview: {
                                    url: "https://cdn.example.com/tenor-1-preview.gif",
                                },
                            },
                        },
                    ],
                }),
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                    status: 200,
                },
            ),
        );

        const response = await GET(
            new NextRequest("http://localhost/api/gifs/search?q=party"),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.next).toBe("next-token");
        expect(data.items).toHaveLength(1);
        expect(data.items[0].source).toBe("tenor");
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const request = mockFetch.mock.calls[0]?.[0] as URL;
        expect(request.toString()).toContain("tenor.googleapis.com/v2/search");
        expect(request.searchParams.get("key")).toBe("tenor-key");
        expect(request.searchParams.get("client_key")).toBe("client-key");
        expect(request.searchParams.get("locale")).toBe("en_GB");
        expect(request.searchParams.get("q")).toBe("party");
        expect(mockTrackApiCall).toHaveBeenCalledWith(
            "/api/gifs/search",
            "GET",
            200,
            expect.any(Number),
            expect.objectContaining({
                itemCount: 1,
                provider: "tenor",
                queryLength: 5,
            }),
        );
    });
});