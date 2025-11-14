/**
 * Tests for utility functions - formatRelativeTime
 */
import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/lib/utils";

describe("Utils - formatRelativeTime", () => {
	it("should return 'just now' for times less than 60 seconds ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("just now");
	});

	it("should return minutes for times less than 1 hour ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("5 minutes ago");
	});

	it("should use singular 'minute' for 1 minute ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 1 * 60 * 1000); // 1 minute ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("1 minute ago");
	});

	it("should return hours for times less than 24 hours ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("3 hours ago");
	});

	it("should use singular 'hour' for 1 hour ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("1 hour ago");
	});

	it("should return days for times less than 7 days ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("2 days ago");
	});

	it("should use singular 'day' for 1 day ago", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("1 day ago");
	});

	it("should return 6 days ago for times 6 days in the past", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // 6 days ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("6 days ago");
	});

	it("should return locale date string for times 7+ days ago", () => {
		const now = new Date();
		const past = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
		
		const result = formatRelativeTime(past);
		
		expect(result).toBe(past.toLocaleDateString());
	});

	it("should handle string date input", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago
		
		const result = formatRelativeTime(recent.toISOString());
		
		expect(result).toBe("2 minutes ago");
	});

	it("should handle Date object input", () => {
		const now = new Date();
		const recent = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
		
		const result = formatRelativeTime(recent);
		
		expect(result).toBe("15 minutes ago");
	});

	it("should handle edge case at exactly 7 days", () => {
		const now = new Date();
		const exactly7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		
		const result = formatRelativeTime(exactly7Days);
		
		// Should return locale date string for 7+ days
		expect(result).toBe(exactly7Days.toLocaleDateString());
	});
});
