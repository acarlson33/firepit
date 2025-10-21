import { describe, expect, it } from "vitest";
import { cn } from "../lib/utils";

describe("Utils - cn function", () => {
	it("should merge class names", () => {
		const result = cn("text-red-500", "bg-blue-500");
		expect(result).toBe("text-red-500 bg-blue-500");
	});

	it("should handle conditional classes", () => {
		const isActive = true;
		const result = cn("base-class", isActive && "conditional-class");
		expect(result).toContain("base-class");
		expect(result).toContain("conditional-class");
	});

	it("should filter out falsy values", () => {
		const isHidden = false;
		const result = cn("base", isHidden && "hidden", null, undefined, "visible");
		expect(result).toContain("base");
		expect(result).toContain("visible");
		expect(result).not.toContain("hidden");
	});

	it("should handle Tailwind conflicts by preferring last class", () => {
		// twMerge should handle conflicting Tailwind classes
		const result = cn("p-4", "p-8");
		expect(result).toBe("p-8");
	});

	it("should handle empty input", () => {
		const result = cn();
		expect(result).toBe("");
	});

	it("should handle arrays of classes", () => {
		const result = cn(["text-sm", "font-bold"], "text-blue-500");
		expect(result).toContain("text-sm");
		expect(result).toContain("font-bold");
		expect(result).toContain("text-blue-500");
	});

	it("should handle objects with boolean values", () => {
		const result = cn({
			"bg-red-500": true,
			"text-white": true,
			"hidden": false,
		});
		expect(result).toContain("bg-red-500");
		expect(result).toContain("text-white");
		expect(result).not.toContain("hidden");
	});

	it("should merge complex combinations", () => {
		const result = cn(
			"base-class",
			["array-class", "another-class"],
			{ "object-class": true, "skipped": false },
			null,
			undefined,
			"final-class"
		);
		expect(result).toContain("base-class");
		expect(result).toContain("array-class");
		expect(result).toContain("another-class");
		expect(result).toContain("object-class");
		expect(result).toContain("final-class");
		expect(result).not.toContain("skipped");
	});
});

describe("Utils - safeJsonParse", () => {
	it("should parse valid JSON", async () => {
		const { safeJsonParse } = await import("../lib/utils");
		const result = safeJsonParse('{"name": "test"}', {});
		expect(result).toEqual({ name: "test" });
	});

	it("should return fallback for invalid JSON", async () => {
		const { safeJsonParse } = await import("../lib/utils");
		const fallback = { default: true };
		const result = safeJsonParse("invalid json", fallback);
		expect(result).toBe(fallback);
	});

	it("should return fallback for empty string", async () => {
		const { safeJsonParse } = await import("../lib/utils");
		const result = safeJsonParse("", null);
		expect(result).toBeNull();
	});
});

describe("Utils - debounce", () => {
	it("should debounce function calls", async () => {
		const { debounce } = await import("../lib/utils");
		let callCount = 0;
		const fn = debounce(() => callCount++, 50);

		fn();
		fn();
		fn();

		expect(callCount).toBe(0);
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(callCount).toBe(1);
	});
});

describe("Utils - formatRelativeTime", () => {
	it("should format recent times", async () => {
		const { formatRelativeTime } = await import("../lib/utils");
		const now = new Date();
		expect(formatRelativeTime(now)).toBe("just now");
	});

	it("should format minutes ago", async () => {
		const { formatRelativeTime } = await import("../lib/utils");
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
		expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 minutes ago");
	});

	it("should format hours ago", async () => {
		const { formatRelativeTime } = await import("../lib/utils");
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		expect(formatRelativeTime(twoHoursAgo)).toBe("2 hours ago");
	});

	it("should handle singular forms", async () => {
		const { formatRelativeTime } = await import("../lib/utils");
		const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
		expect(formatRelativeTime(oneMinuteAgo)).toBe("1 minute ago");
	});
});

describe("Utils - truncate", () => {
	it("should not truncate short text", async () => {
		const { truncate } = await import("../lib/utils");
		expect(truncate("short", 10)).toBe("short");
	});

	it("should truncate long text", async () => {
		const { truncate } = await import("../lib/utils");
		expect(truncate("this is a very long text", 10)).toBe("this is...");
	});

	it("should handle exact length", async () => {
		const { truncate } = await import("../lib/utils");
		expect(truncate("exactly10!", 10)).toBe("exactly10!");
	});
});

describe("Utils - isNonEmptyString", () => {
	it("should return true for non-empty strings", async () => {
		const { isNonEmptyString } = await import("../lib/utils");
		expect(isNonEmptyString("hello")).toBe(true);
		expect(isNonEmptyString("  text  ")).toBe(true);
	});

	it("should return false for empty or whitespace strings", async () => {
		const { isNonEmptyString } = await import("../lib/utils");
		expect(isNonEmptyString("")).toBe(false);
		expect(isNonEmptyString("   ")).toBe(false);
	});

	it("should return false for non-strings", async () => {
		const { isNonEmptyString } = await import("../lib/utils");
		expect(isNonEmptyString(null)).toBe(false);
		expect(isNonEmptyString(undefined)).toBe(false);
		expect(isNonEmptyString(123)).toBe(false);
	});
});

describe("Utils - getInitials", () => {
	it("should get initials from full name", async () => {
		const { getInitials } = await import("../lib/utils");
		expect(getInitials("John Doe")).toBe("JD");
	});

	it("should handle single name", async () => {
		const { getInitials } = await import("../lib/utils");
		expect(getInitials("John")).toBe("J");
	});

	it("should handle empty string", async () => {
		const { getInitials } = await import("../lib/utils");
		expect(getInitials("")).toBe("?");
	});

	it("should handle multiple spaces", async () => {
		const { getInitials } = await import("../lib/utils");
		expect(getInitials("John   Doe")).toBe("JD");
	});

	it("should uppercase initials", async () => {
		const { getInitials } = await import("../lib/utils");
		expect(getInitials("john doe")).toBe("JD");
	});
});

describe("Utils - cn function (extended)", () => {
	it("should merge responsive classes correctly", () => {
		const result = cn("text-base", "md:text-lg", "lg:text-xl");
		expect(result).toContain("text-base");
		expect(result).toContain("md:text-lg");
		expect(result).toContain("lg:text-xl");
	});

	it("should handle dark mode classes", () => {
		const result = cn("bg-white", "dark:bg-black");
		expect(result).toContain("bg-white");
		expect(result).toContain("dark:bg-black");
	});

	it("should handle hover and focus states", () => {
		const result = cn(
			"bg-blue-500",
			"hover:bg-blue-600",
			"focus:ring-2",
			"focus:ring-blue-300",
		);
		expect(result).toContain("bg-blue-500");
		expect(result).toContain("hover:bg-blue-600");
		expect(result).toContain("focus:ring-2");
		expect(result).toContain("focus:ring-blue-300");
	});
});

describe("Utils - formatMessageTimestamp", () => {
	it("should format timestamp with date and time", async () => {
		const { formatMessageTimestamp } = await import("../lib/utils");
		const testDate = "2025-01-15T14:30:00.000Z";
		const result = formatMessageTimestamp(testDate);
		
		// Should contain both date and time components
		expect(result).toBeTruthy();
		expect(result).toContain(" ");
		
		// Verify it's not just time (which was the old behavior)
		const date = new Date(testDate);
		const timeStr = date.toLocaleTimeString();
		expect(result).not.toBe(timeStr);
	});

	it("should handle ISO 8601 date strings", async () => {
		const { formatMessageTimestamp } = await import("../lib/utils");
		const isoDate = "2025-03-20T09:15:30.000Z";
		const result = formatMessageTimestamp(isoDate);
		
		expect(result).toBeTruthy();
		expect(typeof result).toBe("string");
	});

	it("should include both date and time in output", async () => {
		const { formatMessageTimestamp } = await import("../lib/utils");
		const testDate = "2025-06-10T18:45:00.000Z";
		const result = formatMessageTimestamp(testDate);
		
		const date = new Date(testDate);
		const dateStr = date.toLocaleDateString();
		const timeStr = date.toLocaleTimeString();
		
		// Result should be combination of date and time
		expect(result).toBe(`${dateStr} ${timeStr}`);
	});
});
