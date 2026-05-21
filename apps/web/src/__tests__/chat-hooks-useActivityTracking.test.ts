/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { useActivityTracking } from "@/app/chat/hooks/useActivityTracking";
import * as appwriteStatus from "@/lib/appwrite-status";

// Mock the status functions
vi.mock("@/lib/appwrite-status", () => ({
	setUserStatus: vi.fn(() => Promise.resolve()),
	updateLastSeen: vi.fn(() => Promise.resolve()),
	setOffline: vi.fn(() => Promise.resolve()),
}));

describe("useActivityTracking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe("Initial Status", () => {
		it("should set status to online on mount when userId is provided", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "online", undefined, undefined, false);
		});

		it("should not set status when userId is null", () => {
			renderHook(() => useActivityTracking({ userId: null }));

			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should not set status when enabled is false", () => {
			renderHook(() => useActivityTracking({ userId: "user123", enabled: false }));

			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should set status when enabled defaults to true", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "online", undefined, undefined, false);
		});
	});

	describe("Activity Detection", () => {
		it("should listen to mousedown events", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");

			renderHook(() => useActivityTracking({ userId: "user123" }));

			expect(addEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function), { passive: true });
		});

		it("should listen to keydown events", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");

			renderHook(() => useActivityTracking({ userId: "user123" }));

			expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { passive: true });
		});

		it("should reset inactivity timer on mousedown", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Clear initial call
			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Simulate mousedown
			const mouseEvent = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent);

			// Should not set status again immediately since user is already active
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should reset inactivity timer on keydown", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Clear initial call
			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Simulate keydown
			const keyEvent = new KeyboardEvent("keydown");
			window.dispatchEvent(keyEvent);

			// Should not set status again immediately since user is already active
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should set status to away after 5 minutes of inactivity", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Clear initial call
			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Fast-forward 5 minutes
			vi.advanceTimersByTime(5 * 60 * 1000);

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "away", undefined, undefined, false);
		});

		it("should set back to online when activity detected after inactivity", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Fast-forward to inactivity
			vi.advanceTimersByTime(5 * 60 * 1000);

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "away", undefined, undefined, false);

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Simulate activity
			const mouseEvent = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent);

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "online", undefined, undefined, false);
		});

		it("should not set status to away if activity occurs within timeout", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Clear initial call
			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Simulate activity at 4 minutes
			vi.advanceTimersByTime(4 * 60 * 1000);
			const mouseEvent = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent);

			// Wait another 4 minutes (total 8 minutes, but timer resets)
			vi.advanceTimersByTime(4 * 60 * 1000);

			// Should not be away yet since timer was reset
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalledWith("user123", "away", undefined, undefined, false);
		});
	});

	describe("LastSeen Updates", () => {
		it("should update lastSeen every 60 seconds", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Fast-forward 60 seconds
			vi.advanceTimersByTime(60 * 1000);

			expect(appwriteStatus.updateLastSeen).toHaveBeenCalledWith("user123");
		});

		it("should update lastSeen multiple times", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Fast-forward 180 seconds (3 intervals)
			vi.advanceTimersByTime(180 * 1000);

			expect(appwriteStatus.updateLastSeen).toHaveBeenCalledTimes(3);
		});

		it("should not update lastSeen when userId is null", () => {
			const { rerender } = renderHook(({ userId }) => useActivityTracking({ userId }), {
				initialProps: { userId: "user123" as string | null },
			});

			// Fast-forward 60 seconds
			vi.advanceTimersByTime(60 * 1000);

			(appwriteStatus.updateLastSeen as ReturnType<typeof vi.fn>).mockClear();

			// Change userId to null
			rerender({ userId: null });

			// Fast-forward another 60 seconds
			vi.advanceTimersByTime(60 * 1000);

			// Should not call with null
			expect(appwriteStatus.updateLastSeen).not.toHaveBeenCalled();
		});
	});

	describe("Cleanup", () => {
		it("should remove event listeners on unmount", () => {
			const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

			const { unmount } = renderHook(() => useActivityTracking({ userId: "user123" }));

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
		});

		it("should clear inactivity timer on unmount", () => {
			const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

			const { unmount } = renderHook(() => useActivityTracking({ userId: "user123" }));

			unmount();

			// Should clear at least one timeout (the inactivity timer)
			expect(clearTimeoutSpy).toHaveBeenCalled();
		});

		it("should clear lastSeen interval on unmount", () => {
			const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

			const { unmount } = renderHook(() => useActivityTracking({ userId: "user123" }));

			unmount();

			// Should clear the lastSeen interval
			expect(clearIntervalSpy).toHaveBeenCalled();
		});

		it("should set status to offline on unmount", () => {
			const { unmount } = renderHook(() => useActivityTracking({ userId: "user123" }));

			unmount();

			expect(appwriteStatus.setOffline).toHaveBeenCalledWith("user123");
		});

		it("should not set offline when userId is null on unmount", () => {
			const { unmount } = renderHook(() => useActivityTracking({ userId: null }));

			unmount();

			expect(appwriteStatus.setOffline).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		it("should handle multiple activity events in quick succession", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Dispatch multiple events quickly
			for (let i = 0; i < 10; i++) {
				const mouseEvent = new MouseEvent("mousedown");
				window.dispatchEvent(mouseEvent);
			}

			// Should not call setUserStatus for active user
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should handle userId change", () => {
			const { rerender } = renderHook(({ userId }) => useActivityTracking({ userId }), {
				initialProps: { userId: "user123" as string | null },
			});

			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user123", "online", undefined, undefined, false);

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();
			(appwriteStatus.setOffline as ReturnType<typeof vi.fn>).mockClear();

			// Change userId
			rerender({ userId: "user456" });

			// Should set offline for old user and online for new user
			expect(appwriteStatus.setOffline).toHaveBeenCalledWith("user123");
			expect(appwriteStatus.setUserStatus).toHaveBeenCalledWith("user456", "online", undefined, undefined, false);
		});

		it("should handle enabled flag change", () => {
			const { rerender } = renderHook(
				({ enabled }) => useActivityTracking({ userId: "user123", enabled }),
				{
					initialProps: { enabled: true },
				},
			);

			expect(appwriteStatus.setUserStatus).toHaveBeenCalled();

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();
			(appwriteStatus.setOffline as ReturnType<typeof vi.fn>).mockClear();

			// Disable tracking
			rerender({ enabled: false });

			// Should clean up (call setOffline)
			expect(appwriteStatus.setOffline).toHaveBeenCalledWith("user123");
		});

		it("should not handle activity when userId becomes null", () => {
			const { rerender } = renderHook(({ userId }) => useActivityTracking({ userId }), {
				initialProps: { userId: "user123" as string | null },
			});

			// Change userId to null
			rerender({ userId: null });

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Simulate activity
			const mouseEvent = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent);

			// Should not call setUserStatus when userId is null
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});

		it("should handle rapid enable/disable toggling", () => {
			const { rerender } = renderHook(
				({ enabled }) => useActivityTracking({ userId: "user123", enabled }),
				{
					initialProps: { enabled: true },
				},
			);

			// Toggle multiple times
			for (let i = 0; i < 5; i++) {
				rerender({ enabled: false });
				rerender({ enabled: true });
			}

			// Should set offline and online for each toggle
			expect(appwriteStatus.setOffline).toHaveBeenCalled();
			expect(appwriteStatus.setUserStatus).toHaveBeenCalled();
		});
	});

	describe("Timer Management", () => {
		it("should clear previous inactivity timer when activity is detected", () => {
			const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

			renderHook(() => useActivityTracking({ userId: "user123" }));

			// Trigger activity
			const mouseEvent1 = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent1);

			const firstCallCount = clearTimeoutSpy.mock.calls.length;

			// Trigger another activity
			const mouseEvent2 = new MouseEvent("mousedown");
			window.dispatchEvent(mouseEvent2);

			// Should have called clearTimeout again
			expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(firstCallCount);
		});

		it("should not call setUserStatus for activity when already active", () => {
			renderHook(() => useActivityTracking({ userId: "user123" }));

			(appwriteStatus.setUserStatus as ReturnType<typeof vi.fn>).mockClear();

			// Trigger multiple activities while active
			for (let i = 0; i < 5; i++) {
				const mouseEvent = new MouseEvent("mousedown");
				window.dispatchEvent(mouseEvent);
			}

			// Should not call setUserStatus since user is already active
			expect(appwriteStatus.setUserStatus).not.toHaveBeenCalled();
		});
	});
});
