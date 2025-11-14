/**
 * Tests for compression utilities
 */
import { describe, expect, it } from "vitest";
import {
	shouldCompress,
	getCompressionHeaders,
} from "@/lib/compression-utils";

describe("Compression Utils", () => {
	describe("shouldCompress", () => {
		it("should not compress small responses (< 1KB)", () => {
			const result = shouldCompress("application/json", 512);
			expect(result).toBe(false);
		});

		it("should compress JSON responses >= 1KB", () => {
			const result = shouldCompress("application/json", 1024);
			expect(result).toBe(true);
		});

		it("should compress large JSON responses", () => {
			const result = shouldCompress("application/json", 5000);
			expect(result).toBe(true);
		});

		it("should compress text/html responses", () => {
			const result = shouldCompress("text/html", 2000);
			expect(result).toBe(true);
		});

		it("should compress text/css responses", () => {
			const result = shouldCompress("text/css", 1500);
			expect(result).toBe(true);
		});

		it("should compress text/javascript responses", () => {
			const result = shouldCompress("text/javascript", 2048);
			expect(result).toBe(true);
		});

		it("should compress application/javascript responses", () => {
			const result = shouldCompress("application/javascript", 1536);
			expect(result).toBe(true);
		});

		it("should compress text/plain responses", () => {
			const result = shouldCompress("text/plain", 1200);
			expect(result).toBe(true);
		});

		it("should compress text/xml responses", () => {
			const result = shouldCompress("text/xml", 1300);
			expect(result).toBe(true);
		});

		it("should compress application/xml responses", () => {
			const result = shouldCompress("application/xml", 1400);
			expect(result).toBe(true);
		});

		it("should not compress non-compressible content types", () => {
			const result = shouldCompress("image/jpeg", 5000);
			expect(result).toBe(false);
		});

		it("should not compress binary content types", () => {
			const result = shouldCompress("application/pdf", 10000);
			expect(result).toBe(false);
		});

		it("should not compress video content types", () => {
			const result = shouldCompress("video/mp4", 50000);
			expect(result).toBe(false);
		});

		it("should handle content-type with charset", () => {
			const result = shouldCompress("application/json; charset=utf-8", 2000);
			expect(result).toBe(true);
		});

		it("should handle content-type with parameters", () => {
			const result = shouldCompress("text/html; version=1.0", 1500);
			expect(result).toBe(true);
		});

		it("should handle edge case at 1KB boundary", () => {
			expect(shouldCompress("application/json", 1023)).toBe(false);
			expect(shouldCompress("application/json", 1024)).toBe(true);
		});
	});

	describe("getCompressionHeaders", () => {
		it("should return gzip encoding header", () => {
			const headers = getCompressionHeaders();
			expect(headers["Content-Encoding"]).toBe("gzip");
		});

		it("should return Vary header", () => {
			const headers = getCompressionHeaders();
			expect(headers.Vary).toBe("Accept-Encoding");
		});

		it("should return both required headers", () => {
			const headers = getCompressionHeaders();
			expect(Object.keys(headers)).toHaveLength(2);
			expect(headers).toEqual({
				"Content-Encoding": "gzip",
				Vary: "Accept-Encoding",
			});
		});

		it("should return a new object each time", () => {
			const headers1 = getCompressionHeaders();
			const headers2 = getCompressionHeaders();
			expect(headers1).not.toBe(headers2);
			expect(headers1).toEqual(headers2);
		});
	});
});
