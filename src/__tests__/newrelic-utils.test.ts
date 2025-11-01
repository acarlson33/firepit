import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logger,
  recordError,
  setTransactionName,
  trackApiCall,
  addTransactionAttributes,
  recordEvent,
  trackDatabaseQuery,
  recordMetric,
} from "@/lib/newrelic-utils";

// Mock New Relic
const mockNewRelic = {
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
};

// Mock the newrelic module
vi.mock("newrelic", () => ({
  default: mockNewRelic,
}));

describe("newrelic-utils", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    Object.values(mockNewRelic).forEach((fn) => fn.mockClear());
    
    // Mock console methods
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
    });

    it("should log info messages with attributes", () => {
      logger.info("Test info", { userId: "123" });
      expect(console.log).toHaveBeenCalled();
    });

    it("should log error messages", () => {
      logger.error("Test error message");
      expect(console.error).toHaveBeenCalled();
    });

    it("should log error messages with attributes", () => {
      logger.error("Test error", { code: 500 });
      expect(console.error).toHaveBeenCalled();
    });

    it("should log warn messages", () => {
      logger.warn("Test warning message");
      expect(console.warn).toHaveBeenCalled();
    });

    it("should log warn messages with attributes", () => {
      logger.warn("Test warning", { threshold: 100 });
      expect(console.warn).toHaveBeenCalled();
    });

    it("should log debug messages", () => {
      logger.debug("Test debug message");
      expect(console.log).toHaveBeenCalled();
    });

    it("should log debug messages with attributes", () => {
      logger.debug("Test debug", { step: 1 });
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe("recordError", () => {
    it("should record an Error object", () => {
      const error = new Error("Test error");
      recordError(error);
      expect(console.error).toHaveBeenCalledWith("[ERROR]", error, "");
    });

    it("should record an Error with custom attributes", () => {
      const error = new Error("Test error");
      recordError(error, { userId: "123", context: "test" });
      expect(console.error).toHaveBeenCalled();
    });

    it("should record a string error", () => {
      recordError("String error message");
      expect(console.error).toHaveBeenCalledWith("[ERROR]", "String error message", "");
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

  describe("trackDatabaseQuery", () => {
    it("should track database query with basic info without error", () => {
      expect(() => {
        trackDatabaseQuery("SELECT", "users", 45);
      }).not.toThrow();
    });

    it("should track query with count", () => {
      expect(() => {
        trackDatabaseQuery("INSERT", "messages", 120, 1);
      }).not.toThrow();
    });

    it("should track query with custom attributes", () => {
      expect(() => {
        trackDatabaseQuery("DELETE", "logs", 30, undefined, {
          batchSize: 100,
          deletedCount: 95,
        });
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
