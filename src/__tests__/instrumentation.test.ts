import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the newrelic module
vi.mock("newrelic", () => ({
  default: {
    initialized: true,
  },
}));

describe("instrumentation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("should initialize New Relic when license key and app name are provided", async () => {
    // Set up environment for Node.js runtime
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEW_RELIC_LICENSE_KEY = "test-license-key";
    process.env.NEW_RELIC_APP_NAME = "test-app-name";

    // Mock console.log to verify initialization message
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Import the register function
    const { register } = await import("../../instrumentation");

    // Call register
    await register();

    // Verify console.log was called with the correct message
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[New Relic] Initialized for app: test-app-name"
    );

    consoleLogSpy.mockRestore();
  });

  it("should warn when license key is missing", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEW_RELIC_APP_NAME = "test-app-name";
    // NEW_RELIC_LICENSE_KEY is intentionally not set

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { register } = await import("../../instrumentation");
    await register();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[New Relic] NEW_RELIC_LICENSE_KEY not found - APM monitoring disabled"
    );

    consoleWarnSpy.mockRestore();
  });

  it("should warn when app name is missing", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEW_RELIC_LICENSE_KEY = "test-license-key";
    // NEW_RELIC_APP_NAME is intentionally not set

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { register } = await import("../../instrumentation");
    await register();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[New Relic] NEW_RELIC_APP_NAME not found - APM monitoring disabled"
    );

    consoleWarnSpy.mockRestore();
  });

  it("should not initialize on Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.NEW_RELIC_LICENSE_KEY = "test-license-key";
    process.env.NEW_RELIC_APP_NAME = "test-app-name";

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { register } = await import("../../instrumentation");
    await register();

    // Should not log initialization message on Edge runtime
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it("should not initialize when both credentials are missing", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    // Both NEW_RELIC_LICENSE_KEY and NEW_RELIC_APP_NAME are intentionally not set

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { register } = await import("../../instrumentation");
    await register();

    // Should warn about both missing credentials
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[New Relic] NEW_RELIC_LICENSE_KEY not found - APM monitoring disabled"
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[New Relic] NEW_RELIC_APP_NAME not found - APM monitoring disabled"
    );

    // Should not log initialization message
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[New Relic] Initialized")
    );

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
