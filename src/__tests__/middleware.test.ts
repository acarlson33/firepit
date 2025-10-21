import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Setup environment before any imports
const env = process.env as Record<string, string>;
env.APPWRITE_PROJECT_ID = "test-project";

// Mock next/headers
vi.mock("next/headers", () => ({
	cookies: async () => {
		const mockCookies = (globalThis as any).__mockCookies || {};
		return {
			get: (name: string) => mockCookies[name] || null,
		};
	},
}));

// Import middleware after mocks
import { middleware } from "../middleware";

function createMockRequest(pathname: string, searchParams?: Record<string, string>): NextRequest {
	const url = new URL(`http://localhost${pathname}`);
	if (searchParams) {
		Object.entries(searchParams).forEach(([key, value]) => {
			url.searchParams.set(key, value);
		});
	}
	return {
		nextUrl: url,
		url: url.toString(),
	} as NextRequest;
}

function setMockSession(hasSession: boolean) {
	if (hasSession) {
		(globalThis as any).__mockCookies = {
			"a_session_test-project": { value: "mock-session-token" },
		};
	} else {
		(globalThis as any).__mockCookies = {};
	}
}

describe("Middleware", () => {
	beforeEach(() => {
		// Reset mock session before each test
		(globalThis as any).__mockCookies = {};
	});

	describe("Public routes (unauthenticated users)", () => {
		it("should allow access to home page without authentication", async () => {
			setMockSession(false);
			const request = createMockRequest("/");
			const response = await middleware(request);
			
			// next() returns undefined, redirect returns Response
			expect(response.headers.get("location")).toBeNull();
		});

		it("should allow access to login page without authentication", async () => {
			setMockSession(false);
			const request = createMockRequest("/login");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});

		it("should allow access to register page without authentication", async () => {
			setMockSession(false);
			const request = createMockRequest("/register");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});
	});

	describe("Protected routes (unauthenticated users)", () => {
		it("should redirect from /chat to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/chat");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fchat");
		});

		it("should redirect from /admin to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/admin");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fadmin");
		});

		it("should redirect from /moderation to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/moderation");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fmoderation");
		});

		it("should redirect from /profile to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/profile");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fprofile");
		});

		it("should redirect from /settings to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/settings");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fsettings");
		});

		it("should redirect from any other route to /login when not authenticated", async () => {
			setMockSession(false);
			const request = createMockRequest("/some-random-page");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/login");
			expect(location).toContain("redirect=%2Fsome-random-page");
		});
	});

	describe("Auth routes (authenticated users)", () => {
		it("should redirect from /login to home when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/login");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("http://localhost/");
		});

		it("should redirect from /register to home when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/register");
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("http://localhost/");
		});

		it("should redirect to specified redirect path from /login when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/login", { redirect: "/chat" });
			const response = await middleware(request);
			
			const location = response.headers.get("location");
			expect(location).toContain("/chat");
		});
	});

	describe("Protected routes (authenticated users)", () => {
		it("should allow access to /chat when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/chat");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});

		it("should allow access to home page when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});

		it("should allow access to /admin when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/admin");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});

		it("should allow access to /profile when authenticated", async () => {
			setMockSession(true);
			const request = createMockRequest("/profile");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
		});
	});

	describe("Missing project configuration", () => {
		it("should allow access when APPWRITE_PROJECT_ID is missing", async () => {
			const originalProjectId = process.env.APPWRITE_PROJECT_ID;
			delete process.env.APPWRITE_PROJECT_ID;
			
			setMockSession(false);
			const request = createMockRequest("/chat");
			const response = await middleware(request);
			
			expect(response.headers.get("location")).toBeNull();
			
			// Restore
			process.env.APPWRITE_PROJECT_ID = originalProjectId;
		});
	});
});
