import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";

describe("useGlobalSearch", () => {
	let keydownListener: ((event: KeyboardEvent) => void) | null = null;

	beforeEach(() => {
		// Capture the keydown listener
		const originalAddEventListener = window.addEventListener;
		window.addEventListener = vi.fn((event, listener) => {
			if (event === "keydown") {
				keydownListener = listener as (event: KeyboardEvent) => void;
			}
			originalAddEventListener.call(window, event, listener);
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		keydownListener = null;
	});

	it("should initialize with isOpen as false", () => {
		const { result } = renderHook(() => useGlobalSearch());

		expect(result.current.isOpen).toBe(false);
	});

	it("should provide open function", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			result.current.open();
		});

		expect(result.current.isOpen).toBe(true);
	});

	it("should provide close function", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			result.current.open();
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.close();
		});

		expect(result.current.isOpen).toBe(false);
	});

	it("should provide toggle function", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			result.current.toggle();
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.toggle();
		});

		expect(result.current.isOpen).toBe(false);
	});

	it("should provide setIsOpen function", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			result.current.setIsOpen(true);
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			result.current.setIsOpen(false);
		});

		expect(result.current.isOpen).toBe(false);
	});

	it("should toggle on Ctrl+K", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			if (keydownListener) {
				keydownListener(
					new KeyboardEvent("keydown", { ctrlKey: true, key: "k" }),
				);
			}
		});

		expect(result.current.isOpen).toBe(true);

		act(() => {
			if (keydownListener) {
				keydownListener(
					new KeyboardEvent("keydown", { ctrlKey: true, key: "k" }),
				);
			}
		});

		expect(result.current.isOpen).toBe(false);
	});

	it("should toggle on Cmd+K (Mac)", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			if (keydownListener) {
				keydownListener(
					new KeyboardEvent("keydown", { metaKey: true, key: "k" }),
				);
			}
		});

		expect(result.current.isOpen).toBe(true);
	});

	it("should not toggle on other key combinations", () => {
		const { result } = renderHook(() => useGlobalSearch());

		act(() => {
			if (keydownListener) {
				keydownListener(new KeyboardEvent("keydown", { key: "k" }));
			}
		});

		expect(result.current.isOpen).toBe(false);

		act(() => {
			if (keydownListener) {
				keydownListener(
					new KeyboardEvent("keydown", { ctrlKey: true, key: "a" }),
				);
			}
		});

		expect(result.current.isOpen).toBe(false);
	});

	it("should cleanup event listener on unmount", () => {
		const removeEventListener = vi.spyOn(window, "removeEventListener");

		const { unmount } = renderHook(() => useGlobalSearch());

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith(
			"keydown",
			expect.any(Function),
		);
	});
});
