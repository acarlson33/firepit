import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
    recordEvent,
    recordMetric,
    __resetPostHogClient,
} from "@/lib/newrelic-utils";

const {
    mockEmit,
    mockSetGlobalLoggerProvider,
    mockNewRelic,
    mockPostHogCapture,
    mockPostHogCaptureException,
} = vi.hoisted(() => ({
    mockEmit: vi.fn(),
    mockSetGlobalLoggerProvider: vi.fn(),
    mockNewRelic: {
        recordCustomEvent: vi.fn(),
        recordMetric: vi.fn(),
        incrementMetric: vi.fn(),
        noticeError: vi.fn(),
        addCustomAttribute: vi.fn(),
        addCustomAttributes: vi.fn(),
        setTransactionName: vi.fn(),
        getTransaction: vi.fn(),
        startBackgroundTransaction: vi.fn(),
        startWebTransaction: vi.fn(),
        endTransaction: vi.fn(),
        getBrowserTimingHeader: vi.fn(),
        setLlmTokenCountCallback: vi.fn(),
    },
    mockPostHogCapture: vi.fn(),
    mockPostHogCaptureException: vi.fn(),
}));

vi.mock("newrelic", () => ({
    default: mockNewRelic,
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
    LoggerProvider: vi.fn().mockImplementation(function () {
        return {
            getLogger: vi.fn().mockImplementation(() => ({
                emit: mockEmit,
            })),
            forceFlush: vi.fn().mockResolvedValue(undefined),
        };
    }),
    BatchLogRecordProcessor: vi.fn(),
    SimpleLogRecordProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/api-logs", () => ({
    SeverityNumber: {
        DEBUG: 5,
        INFO: 9,
        WARN: 13,
        ERROR: 17,
    },
    logs: {
        setGlobalLoggerProvider: mockSetGlobalLoggerProvider,
    },
}));

vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({
    OTLPLogExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
    resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock("posthog-node", () => ({
    PostHog: vi.fn().mockImplementation(function () {
        return {
            capture: mockPostHogCapture,
            captureException: mockPostHogCaptureException,
            flush: vi.fn().mockResolvedValue(undefined),
            shutdown: vi.fn().mockResolvedValue(undefined),
        };
    }),
}));

vi.mock("next/server", () => ({
    NextResponse: {
        json: vi.fn().mockReturnValue({ status: 200 }),
    },
    after: vi.fn(),
}));

describe("newrelic-utils", () => {
    beforeEach(() => {
        __resetPostHogClient();
        Object.values(mockNewRelic).forEach((fn) => fn.mockClear());
        mockEmit.mockClear();
        mockSetGlobalLoggerProvider.mockClear();
        mockPostHogCapture.mockClear();
        mockPostHogCaptureException.mockClear();
        delete process.env.TELEMETRY_PROVIDER;
        delete process.env.POSTHOG_PROJECT_API_KEY;
        delete process.env.POSTHOG_HOST;
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
        process.env.ENABLE_POSTHOG_IN_TESTS = "true";

        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("logger", () => {
        it("should log info messages", () => {
            logger.info("Test info message");
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test info message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log info messages with attributes", () => {
            logger.info("Test info", { userId: "123" });
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test info",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({ userId: "123" }),
                }),
            );
        });

        it("should log error messages", () => {
            logger.error("Test error message");
            expect(console.error).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test error message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log error messages with attributes", () => {
            logger.error("Test error", { code: 500 });
            expect(console.error).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test error",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({ code: 500 }),
                }),
            );
        });

        it("should log warn messages", () => {
            logger.warn("Test warning message");
            expect(console.warn).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test warning message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log warn messages with attributes", () => {
            logger.warn("Test warning", { threshold: 100 });
            expect(console.warn).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test warning",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({ threshold: 100 }),
                }),
            );
        });

        it("should log debug messages", () => {
            logger.debug("Test debug message");
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test debug message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log debug messages with attributes", () => {
            logger.debug("Test debug", { step: 1 });
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test debug",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({ step: 1 }),
                }),
            );
        });
    });

    describe("recordError", () => {
        it("should record an Error object", () => {
            const error = new Error("Test error");
            recordError(error);
            expect(console.error).toHaveBeenCalledWith("[ERROR]", error, "");
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test error",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({
                        errorMessage: "Test error",
                        errorName: "Error",
                    }),
                }),
            );
        });

        it("should record an Error with custom attributes", () => {
            const error = new Error("Test error");
            recordError(error, { userId: "123", context: "test" });
            expect(console.error).toHaveBeenCalled();
        });

        it("should record a string error", () => {
            recordError("String error message");
            expect(console.error).toHaveBeenCalledWith(
                "[ERROR]",
                "String error message",
                "",
            );
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "String error message",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({
                        errorMessage: "String error message",
                        errorName: "Error",
                    }),
                }),
            );
        });

        it("should record a string error with custom attributes", () => {
            recordError("String error", { code: 404 });
            expect(console.error).toHaveBeenCalled();
        });

        it("should handle null error gracefully", () => {
            recordError(null as never);
            expect(console.error).toHaveBeenCalled();
        });

        it("should handle undefined error gracefully", () => {
            recordError(undefined as never);
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("setTransactionName", () => {
        it("should set transaction name without error", () => {
            expect(() => {
                setTransactionName("/api/test");
            }).not.toThrow();
        });

        it("should handle empty string", () => {
            expect(() => {
                setTransactionName("");
            }).not.toThrow();
        });

        it("should handle special characters", () => {
            expect(() => {
                setTransactionName("/api/users/[id]");
            }).not.toThrow();
        });
    });

    describe("trackApiCall", () => {
        it("should track API call with basic info without error", () => {
            expect(() => {
                trackApiCall("/api/users", "GET", 200, 150);
            }).not.toThrow();
        });

        it("should track API call with custom attributes", () => {
            expect(() => {
                trackApiCall("/api/custom", "PATCH", 200, 75, {
                    feature: "test",
                    version: "1.0",
                });
            }).not.toThrow();
        });

        it("should track failed API call", () => {
            expect(() => {
                trackApiCall("/api/error", "GET", 500, 100, {
                    error: "Internal server error",
                });
            }).not.toThrow();
        });
    });

    describe("addTransactionAttributes", () => {
        it("should add single attribute without error", () => {
            expect(() => {
                addTransactionAttributes({ key: "value" });
            }).not.toThrow();
        });

        it("should add multiple attributes", () => {
            expect(() => {
                addTransactionAttributes({
                    userId: "123",
                    action: "create",
                    timestamp: 1234567890,
                });
            }).not.toThrow();
        });

        it("should handle empty attributes", () => {
            expect(() => {
                addTransactionAttributes({});
            }).not.toThrow();
        });

        it("should handle boolean attributes", () => {
            expect(() => {
                addTransactionAttributes({
                    isAdmin: true,
                    isActive: false,
                });
            }).not.toThrow();
        });

        it("should handle numeric attributes", () => {
            expect(() => {
                addTransactionAttributes({
                    count: 42,
                    score: 98.5,
                });
            }).not.toThrow();
        });
    });

    describe("recordEvent", () => {
        it("should record event with name and attributes without error", () => {
            expect(() => {
                recordEvent("UserLogin", { userId: "123", method: "oauth" });
            }).not.toThrow();
        });

        it("should record event without attributes", () => {
            expect(() => {
                recordEvent("PageView", {});
            }).not.toThrow();
        });

        it("should record event with complex attributes", () => {
            expect(() => {
                recordEvent("Purchase", {
                    productId: "prod123",
                    quantity: 2,
                    price: 29.99,
                    currency: "USD",
                });
            }).not.toThrow();
        });

        it("should handle special characters in event name", () => {
            expect(() => {
                recordEvent("User:Signup:Success", { platform: "web" });
            }).not.toThrow();
        });
    });

    describe("recordMetric", () => {
        it("should record metric with name and value without error", () => {
            expect(() => {
                recordMetric("response.time", 150);
            }).not.toThrow();
        });

        it("should record metric with zero value", () => {
            expect(() => {
                recordMetric("errors.count", 0);
            }).not.toThrow();
        });

        it("should record metric with large value", () => {
            expect(() => {
                recordMetric("bytes.transferred", 1048576);
            }).not.toThrow();
        });

        it("should record metric with decimal value", () => {
            expect(() => {
                recordMetric("cpu.usage", 45.67);
            }).not.toThrow();
        });

        it("should handle metric names with namespaces", () => {
            expect(() => {
                recordMetric("custom.metrics.api.latency", 250);
            }).not.toThrow();
        });
    });
});
