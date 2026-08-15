/**
 * Tests for GET /api/example-newrelic endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/example-newrelic/route";
import { NextRequest } from "next/server";

// Mock newrelic-utils
vi.mock("@/lib/newrelic-utils", () => ({
    returnUnauthorized: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    returnForbidden: () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
    recordError: vi.fn(),
    setTransactionName: vi.fn(),
    trackApiCall: vi.fn(),
    addTransactionAttributes: vi.fn(),
}));

import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";

describe("GET /api/example-newrelic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should successfully process request with New Relic instrumentation", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
            {
                headers: {
                    "user-agent": "test-agent",
                },
            },
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe("Hello from New Relic instrumented API!");

        // Verify New Relic instrumentation was called
        expect(setTransactionName).toHaveBeenCalledWith(
            "GET /api/example-newrelic",
        );
        expect(addTransactionAttributes).toHaveBeenCalledWith({
            endpoint: "/api/example-newrelic",
            method: "GET",
            userAgent: "test-agent",
        });
        expect(trackApiCall).toHaveBeenCalledWith(
            "/api/example-newrelic",
            "GET",
            200,
            expect.any(Number),
            { cached: false },
        );
        expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it("should use 'unknown' user agent when header is missing", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(addTransactionAttributes).toHaveBeenCalledWith({
            endpoint: "/api/example-newrelic",
            method: "GET",
            userAgent: "unknown",
        });
    });

    it("should track request duration accurately", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        await GET(request);

        // Verify duration was tracked (should be >= 0)
        const trackApiCallArgs = vi.mocked(trackApiCall).mock.calls[0];
        const duration = trackApiCallArgs[3];
        expect(typeof duration).toBe("number");
        expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should log request details", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        await GET(request);

        // Check that success was logged
        expect(logger.info).toHaveBeenCalledWith(
            "Example API request succeeded",
            {
                duration: expect.any(Number),
            },
        );

        // Verify logger.info was called at least once
        expect(logger.info).toHaveBeenCalled();
    });
});
