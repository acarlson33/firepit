import { describe, expect, it, vi } from "vitest";

async function importFreshRateLimitModule() {
    vi.resetModules();
    return import("@/lib/rate-limit");
}

describe("rate-limit env parsing", () => {
    it("falls back to auth defaults for invalid env values", async () => {
        process.env.RATE_LIMIT_AUTH_WINDOW_MS = "-1";
        process.env.RATE_LIMIT_AUTH_MAX = "0";

        const { rateLimitRequest } = await importFreshRateLimitModule();
        const request = new Request("http://localhost/api/login");

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect(rateLimitRequest(request, "/api/login").allowed).toBe(true);
        }

        expect(rateLimitRequest(request, "/api/login").allowed).toBe(false);
    });

    it("falls back to api defaults for invalid env values", async () => {
        process.env.RATE_LIMIT_API_WINDOW_MS = "NaN";
        process.env.RATE_LIMIT_API_MAX = "-50";

        const { rateLimitRequest } = await importFreshRateLimitModule();
        const request = new Request("http://localhost/api/messages");

        for (let attempt = 0; attempt < 60; attempt += 1) {
            expect(rateLimitRequest(request, "/api/messages").allowed).toBe(
                true,
            );
        }

        expect(rateLimitRequest(request, "/api/messages").allowed).toBe(false);
    });
});
