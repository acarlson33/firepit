import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPostHogCapture = vi.fn();
const mockPostHogCaptureException = vi.fn();
const mockPostHogFlush = vi.fn(async () => undefined);
const mockPostHogShutdown = vi.fn(async () => undefined);
const mockPostHogConstructor = vi.fn(() => ({
    capture: mockPostHogCapture,
    captureException: mockPostHogCaptureException,
    captureExceptionImmediate: mockPostHogCaptureException,
    flush: mockPostHogFlush,
    shutdown: mockPostHogShutdown,
}));

vi.mock("posthog-node", () => ({
    PostHog: mockPostHogConstructor,
}));

describe("posthog-server", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        delete process.env.POSTHOG_PROJECT_API_KEY;
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        delete process.env.POSTHOG_HOST;
    });

    afterEach(() => {
        delete process.env.POSTHOG_PROJECT_API_KEY;
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        delete process.env.POSTHOG_HOST;
        vi.restoreAllMocks();
    });

    it("captures server exceptions with PostHog captureException", async () => {
        process.env.POSTHOG_PROJECT_API_KEY = "test-token";

        const { capturePostHogServerError } = await import("@/lib/posthog-server");
        const error = new Error("server blew up");

        capturePostHogServerError(error, { route: "/api/example" });

        expect(mockPostHogConstructor).toHaveBeenCalledTimes(1);
        expect(mockPostHogCaptureException).toHaveBeenCalledWith(
            error,
            "server",
            expect.objectContaining({
                errorMessage: "server blew up",
                route: "/api/example",
            }),
        );
    });

    it("registers process handlers once and flushes on unhandled rejection", async () => {
        process.env.POSTHOG_PROJECT_API_KEY = "test-token";
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            const processOnSpy = vi
                .spyOn(process, "on")
                .mockImplementation((() => process) as typeof process.on);
            const processOnceSpy = vi
                .spyOn(process, "once")
                .mockImplementation((() => process) as typeof process.once);

            const { registerPostHogProcessHandlers } = await import(
                "@/lib/posthog-server"
            );

            registerPostHogProcessHandlers();
            registerPostHogProcessHandlers();

            const firstPassCalls = processOnSpy.mock.calls;
            expect(firstPassCalls.length).toBeGreaterThan(0);

            const unhandledRejectionCall = firstPassCalls.find(
                (call) => call[0] === "unhandledRejection",
            );
            expect(unhandledRejectionCall).toBeDefined();

            const handler = unhandledRejectionCall?.[1];
            expect(typeof handler).toBe("function");
            const unhandledRejectionHandler = handler as (
                reason: unknown,
            ) => Promise<void>;
            const setImmediateSpy = vi
                .spyOn(globalThis, "setImmediate")
                .mockImplementation((callback: (...args: unknown[]) => void) => {
                    try {
                        callback();
                    } catch {
                        // The real callback throws to trigger process-level handling.
                    }

                    return 0 as never;
                });

            await unhandledRejectionHandler(new Error("rejection failure"));

            expect(mockPostHogCaptureException).toHaveBeenCalledWith(
                expect.objectContaining({ message: "rejection failure" }),
                "server",
                expect.objectContaining({ origin: "unhandled_rejection" }),
            );
            expect(setImmediateSpy).toHaveBeenCalled();
            expect(processOnceSpy).toHaveBeenCalledWith(
                "beforeExit",
                expect.any(Function),
            );
            expect(processOnceSpy).toHaveBeenCalledWith(
                "SIGINT",
                expect.any(Function),
            );
            expect(processOnceSpy).toHaveBeenCalledWith(
                "SIGTERM",
                expect.any(Function),
            );

            const unhandledRejectionListenerCount = firstPassCalls.filter(
                (call) => call[0] === "unhandledRejection",
            ).length;
            expect(unhandledRejectionListenerCount).toBe(1);
        } finally {
            process.env.NODE_ENV = previousNodeEnv;
        }
    });
});
