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
