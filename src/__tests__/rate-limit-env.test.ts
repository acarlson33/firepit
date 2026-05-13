import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalEnv: NodeJS.ProcessEnv;

async function importFreshRateLimitModule() {
    vi.resetModules();
    return import("@/lib/rate-limit");
}

describe("rate-limit env parsing", () => {
    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }

        for (const [key, value] of Object.entries(originalEnv)) {
            if (typeof value === "undefined") {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }

        vi.resetModules();
    });

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

    it("uses the bearer token when no public client ip is available", async () => {
        process.env.RATE_LIMIT_API_MAX = "1";

        const { rateLimitRequest } = await importFreshRateLimitModule();
        const requestA = new Request("http://localhost/api/messages", {
            headers: {
                Authorization: "Bearer token-a",
                "User-Agent": "test-agent",
                "Accept-Language": "en-US",
            },
        });
        const requestB = new Request("http://localhost/api/messages", {
            headers: {
                Authorization: "Bearer token-b",
                "User-Agent": "test-agent",
                "Accept-Language": "en-US",
            },
        });

        expect(rateLimitRequest(requestA, "/api/messages").allowed).toBe(true);
        expect(rateLimitRequest(requestA, "/api/messages").allowed).toBe(false);
        expect(rateLimitRequest(requestB, "/api/messages").allowed).toBe(true);
    });
});
