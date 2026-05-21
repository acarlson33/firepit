/**
 * Tests for GET /api/example-newrelic endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/example-newrelic/route";
import { NextRequest } from "next/server";

// Mock newrelic-utils
vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
    recordError: vi.fn(),
    setTransactionName: vi.fn(),
    trackApiCall: vi.fn(),
    measureAsync: vi.fn((name, fn) => fn()),
    addTransactionAttributes: vi.fn(),
}));

import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    measureAsync,
    addTransactionAttributes,
} from "@/lib/newrelic-utils";

describe("GET /api/example-newrelic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(measureAsync).mockImplementation((_, fn) => fn());
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
        expect(setTransactionName).toHaveBeenCalledWith("GET /api/example");
        expect(addTransactionAttributes).toHaveBeenCalledWith({
            endpoint: "/api/example",
            method: "GET",
            userAgent: "test-agent",
        });
        expect(measureAsync).toHaveBeenCalledWith(
            "example-operation",
            expect.any(Function),
            { operation: "example" },
        );
        expect(trackApiCall).toHaveBeenCalledWith(
            "/api/example",
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
            endpoint: "/api/example",
            method: "GET",
            userAgent: "unknown",
        });
    });

    it("should handle errors and record them in New Relic", async () => {
        vi.mocked(measureAsync).mockRejectedValue(new Error("Test error"));

        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Internal server error");

        // Verify error was recorded
        expect(recordError).toHaveBeenCalledWith(expect.any(Error), {
            endpoint: "/api/example",
            method: "GET",
        });
        expect(trackApiCall).toHaveBeenCalledWith(
            "/api/example",
            "GET",
            500,
            expect.any(Number),
            { error: true },
        );
        expect(logger.error).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
        vi.mocked(measureAsync).mockRejectedValue("String error");

        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(recordError).toHaveBeenCalledWith(
            "String error",
            expect.any(Object),
        );
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

    it("should log error details on failure", async () => {
        const testError = new Error("Test failure");
        vi.mocked(measureAsync).mockRejectedValue(testError);

        const request = new NextRequest(
            "http://localhost:3000/api/example-newrelic",
        );

        await GET(request);

        expect(logger.error).toHaveBeenCalledWith(
            "Example API request failed",
            expect.objectContaining({
                error: "Test failure",
                duration: expect.any(Number),
            }),
        );
    });
});
