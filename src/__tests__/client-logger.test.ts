/**
 * Tests for client-logger
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/client-logger";

describe("ClientLogger", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	let mockNewRelic: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockNewRelic = {
			addPageAction: vi.fn(),
			noticeError: vi.fn(),
		};

		// Mock console methods
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		vi.restoreAllMocks();
	});

	describe("info", () => {
		it("should log to console in development mode", () => {
			process.env.NODE_ENV = "development";

			logger.info("Test info message", { userId: "123" });

			expect(console.log).toHaveBeenCalledWith(
				"[INFO] Test info message",
				{ userId: "123" }
			);
		});

		it("should not log to console in production mode", () => {
			process.env.NODE_ENV = "production";

			logger.info("Test info message");

			expect(console.log).not.toHaveBeenCalled();
		});

		it("should send to New Relic when available", () => {
			(global as any).window = { newrelic: mockNewRelic };

			logger.info("Test message", { key: "value" });

			expect(mockNewRelic.addPageAction).toHaveBeenCalledWith("log_info", {
				message: "Test message",
				key: "value",
			});

			delete (global as any).window;
		});

		it("should handle info without attributes", () => {
			process.env.NODE_ENV = "development";

			logger.info("Simple message");

			expect(console.log).toHaveBeenCalledWith("[INFO] Simple message", "");
		});
	});

	describe("warn", () => {
		it("should log warnings to console in development", () => {
			process.env.NODE_ENV = "development";

			logger.warn("Warning message", { severity: "high" });

			expect(console.warn).toHaveBeenCalledWith("[WARN] Warning message", {
				severity: "high",
			});
		});

		it("should not log to console in production", () => {
			process.env.NODE_ENV = "production";

			logger.warn("Warning message");

			expect(console.warn).not.toHaveBeenCalled();
		});

		it("should send warnings to New Relic", () => {
			(global as any).window = { newrelic: mockNewRelic };

			logger.warn("Warning", { code: 123 });

			expect(mockNewRelic.addPageAction).toHaveBeenCalledWith("log_warn", {
				message: "Warning",
				code: 123,
			});

			delete (global as any).window;
		});
	});

	describe("error", () => {
		it("should log errors to console in development", () => {
			process.env.NODE_ENV = "development";

			logger.error("Error message", new Error("Test error"), { context: "test" });

			expect(console.error).toHaveBeenCalledWith(
				"[ERROR] Error message",
				expect.any(Error),
				{ context: "test" }
			);
		});

		it("should send Error objects to New Relic noticeError", () => {
			(global as any).window = { newrelic: mockNewRelic };
			const testError = new Error("Test error");

			logger.error("Error occurred", testError, { userId: "456" });

			expect(mockNewRelic.noticeError).toHaveBeenCalledWith(testError, {
				message: "Error occurred",
				userId: "456",
			});

			delete (global as any).window;
		});

		it("should send string errors to New Relic addPageAction", () => {
			(global as any).window = { newrelic: mockNewRelic };

			logger.error("Error message", "String error", { context: "api" });

			expect(mockNewRelic.addPageAction).toHaveBeenCalledWith("log_error", {
				message: "Error message",
				error: "String error",
				context: "api",
			});

			delete (global as any).window;
		});

		it("should handle errors without error object", () => {
			process.env.NODE_ENV = "development";

			logger.error("Error message");

			expect(console.error).toHaveBeenCalledWith("[ERROR] Error message", "", "");
		});

		it("should handle errors without attributes", () => {
			process.env.NODE_ENV = "development";
			const testError = new Error("Test");

			logger.error("Error", testError);

			expect(console.error).toHaveBeenCalledWith(
				"[ERROR] Error",
				testError,
				""
			);
		});
	});

	describe("debug", () => {
		it("should log debug messages in development mode", () => {
			process.env.NODE_ENV = "development";

			logger.debug("Debug message", { detail: "test" });

			expect(console.log).toHaveBeenCalledWith("[DEBUG] Debug message", {
				detail: "test",
			});
		});

		it("should not log debug in production", () => {
			process.env.NODE_ENV = "production";

			logger.debug("Debug message");

			expect(console.log).not.toHaveBeenCalled();
		});

		it("should never send debug to New Relic", () => {
			(global as any).window = { newrelic: mockNewRelic };
			process.env.NODE_ENV = "development";

			logger.debug("Debug message");

			expect(mockNewRelic.addPageAction).not.toHaveBeenCalled();
			expect(mockNewRelic.noticeError).not.toHaveBeenCalled();

			delete (global as any).window;
		});
	});

	describe("getNewRelic", () => {
		it("should return null when window is undefined (server-side)", () => {
			const originalWindow = global.window;
			delete (global as any).window;

			logger.info("Test");

			// Should not throw error

			(global as any).window = originalWindow;
		});
	});

	describe("attribute types", () => {
		it("should handle various attribute types", () => {
			process.env.NODE_ENV = "development";

			logger.info("Test", {
				string: "value",
				number: 123,
				boolean: true,
				null: null,
				undefined: undefined,
			});

			expect(console.log).toHaveBeenCalledWith("[INFO] Test", {
				string: "value",
				number: 123,
				boolean: true,
				null: null,
				undefined: undefined,
			});
		});
	});
});
