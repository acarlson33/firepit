/**
 * Tests for API compression middleware
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { compressedResponse, addCompressionHeaders } from "@/lib/api-compression";

describe("API Compression", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("compressedResponse", () => {
		it("should return NextResponse for small payloads without compression headers", () => {
			const data = { message: "Hi" };
			const response = compressedResponse(data);
			
			expect(response).toBeInstanceOf(NextResponse);
			expect(response.headers.get("X-Compressible")).toBeNull();
		});

		it("should add compression headers for large JSON payloads", () => {
			// Create a large payload (> 1KB)
			const largeData = {
				items: Array.from({ length: 100 }, (_, i) => ({
					id: i,
					name: `Item ${i}`,
					description: "This is a test item with some description text to make it larger",
				})),
			};

			const response = compressedResponse(largeData);
			
			expect(response.headers.get("X-Compressible")).toBe("true");
			expect(response.headers.get("Vary")).toContain("Accept-Encoding");
		});

		it("should set Vary header when no existing Vary header", () => {
			const largeData = {
				items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
			};

			const response = compressedResponse(largeData);
			
			expect(response.headers.get("Vary")).toBe("Accept-Encoding");
		});

		it("should append to existing Vary header", () => {
			const largeData = {
				items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
			};

			const response = compressedResponse(largeData, {
				headers: { "Vary": "Origin" },
			});
			
			expect(response.headers.get("Vary")).toContain("Origin");
			expect(response.headers.get("Vary")).toContain("Accept-Encoding");
		});

		it("should log compression info in development mode", () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = "development";
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const largeData = {
				items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
			};

			compressedResponse(largeData);
			
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Compression]")
			);
			
			consoleSpy.mockRestore();
			process.env.NODE_ENV = originalEnv;
		});

		it("should not log in production mode", () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = "production";
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const largeData = {
				items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
			};

			compressedResponse(largeData);
			
			expect(consoleSpy).not.toHaveBeenCalled();
			
			consoleSpy.mockRestore();
			process.env.NODE_ENV = originalEnv;
		});

		it("should accept custom status code", () => {
			const data = { error: "Not found" };
			const response = compressedResponse(data, { status: 404 });
			
			expect(response.status).toBe(404);
		});

		it("should accept custom headers", () => {
			const data = { message: "OK" };
			const response = compressedResponse(data, {
				headers: { "X-Custom": "value" },
			});
			
			expect(response.headers.get("X-Custom")).toBe("value");
		});
	});

	describe("addCompressionHeaders", () => {
		it("should add compression headers to JSON response", () => {
			const response = NextResponse.json({ message: "test" });
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("X-Compressible")).toBe("true");
			expect(enhanced.headers.get("Vary")).toBe("Accept-Encoding");
		});

		it("should append to existing Vary header", () => {
			const response = NextResponse.json({ message: "test" });
			response.headers.set("Vary", "Origin");
			
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("Vary")).toContain("Origin");
			expect(enhanced.headers.get("Vary")).toContain("Accept-Encoding");
		});

		it("should not add headers for non-JSON responses", () => {
			const response = new NextResponse("text content", {
				headers: { "Content-Type": "text/plain" },
			});
			
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("X-Compressible")).toBeNull();
		});

		it("should handle response without content-type header", () => {
			const response = new NextResponse("content");
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("X-Compressible")).toBeNull();
		});

		it("should work with application/json content type", () => {
			const response = new NextResponse(JSON.stringify({ data: "test" }), {
				headers: { "Content-Type": "application/json" },
			});
			
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("X-Compressible")).toBe("true");
		});

		it("should work with application/json with charset", () => {
			const response = new NextResponse(JSON.stringify({ data: "test" }), {
				headers: { "Content-Type": "application/json; charset=utf-8" },
			});
			
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced.headers.get("X-Compressible")).toBe("true");
		});

		it("should return the same response object", () => {
			const response = NextResponse.json({ message: "test" });
			const enhanced = addCompressionHeaders(response);
			
			expect(enhanced).toBe(response);
		});
	});
});
