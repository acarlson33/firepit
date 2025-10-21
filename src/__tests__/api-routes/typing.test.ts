/**
 * Tests for typing status API route
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, DELETE } from "@/app/api/typing/route";
import { NextRequest } from "next/server";

// Mock the server dependencies
vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			createDocument: vi.fn(),
			updateDocument: vi.fn(),
			deleteDocument: vi.fn(),
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			typing: "typing",
		},
	})),
}));

vi.mock("@/lib/auth-server", () => ({
	getServerSession: vi.fn(),
}));

describe("Typing API Route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("POST /api/typing", () => {
		it("should require authentication", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			vi.mocked(getServerSession).mockResolvedValue(null);

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "POST",
				body: JSON.stringify({ channelId: "channel-123" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should require channelId", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("channelId is required");
		});

		it("should create typing status when document doesn't exist", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getServerClient } = await import("@/lib/appwrite-server");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const mockCreate = vi.fn().mockResolvedValue({ $id: "typing-doc-123" });
			const mockUpdate = vi.fn().mockRejectedValue(new Error("Document not found"));

			vi.mocked(getServerClient).mockReturnValue({
				client: {} as never,
				databases: {
					createDocument: mockCreate,
					updateDocument: mockUpdate,
					deleteDocument: vi.fn(),
				} as never,
				teams: {} as never,
			});

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "POST",
				body: JSON.stringify({
					channelId: "channel-123",
					userName: "Test User",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockUpdate).toHaveBeenCalled();
			expect(mockCreate).toHaveBeenCalled();
		});

		it("should update typing status when document exists", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getServerClient } = await import("@/lib/appwrite-server");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const mockUpdate = vi.fn().mockResolvedValue({ $id: "typing-doc-123" });

			vi.mocked(getServerClient).mockReturnValue({
				client: {} as never,
				databases: {
					createDocument: vi.fn(),
					updateDocument: mockUpdate,
					deleteDocument: vi.fn(),
				} as never,
				teams: {} as never,
			});

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "POST",
				body: JSON.stringify({
					channelId: "channel-123",
					userName: "Test User",
				}),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockUpdate).toHaveBeenCalled();
		});

		it("should handle missing typing collection", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getEnvConfig } = await import("@/lib/appwrite-core");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			vi.mocked(getEnvConfig).mockReturnValue({
				databaseId: "test-db",
				collections: {
					typing: null,
				},
			} as never);

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "POST",
				body: JSON.stringify({ channelId: "channel-123" }),
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.error).toBe("Typing collection not configured");
		});
	});

	describe("DELETE /api/typing", () => {
		it("should require authentication", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			vi.mocked(getServerSession).mockResolvedValue(null);

			const request = new NextRequest(
				"http://localhost:3000/api/typing?channelId=channel-123",
				{
					method: "DELETE",
				}
			);

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});

		it("should require channelId", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const request = new NextRequest("http://localhost:3000/api/typing", {
				method: "DELETE",
			});

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("channelId is required");
		});

		it("should delete typing status", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getServerClient } = await import("@/lib/appwrite-server");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const mockDelete = vi.fn().mockResolvedValue({});

			vi.mocked(getServerClient).mockReturnValue({
				client: {} as never,
				databases: {
					createDocument: vi.fn(),
					updateDocument: vi.fn(),
					deleteDocument: mockDelete,
				} as never,
				teams: {} as never,
			});

			const request = new NextRequest(
				"http://localhost:3000/api/typing?channelId=channel-123",
				{
					method: "DELETE",
				}
			);

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockDelete).toHaveBeenCalled();
		});

		it("should handle missing document gracefully", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getServerClient } = await import("@/lib/appwrite-server");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			const mockDelete = vi.fn().mockRejectedValue(new Error("Document not found"));

			vi.mocked(getServerClient).mockReturnValue({
				client: {} as never,
				databases: {
					createDocument: vi.fn(),
					updateDocument: vi.fn(),
					deleteDocument: mockDelete,
				} as never,
				teams: {} as never,
			});

			const request = new NextRequest(
				"http://localhost:3000/api/typing?channelId=channel-123",
				{
					method: "DELETE",
				}
			);

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it("should handle missing typing collection", async () => {
			const { getServerSession } = await import("@/lib/auth-server");
			const { getEnvConfig } = await import("@/lib/appwrite-core");

			vi.mocked(getServerSession).mockResolvedValue({
				$id: "user-123",
				name: "Test User",
				email: "test@example.com",
			});

			vi.mocked(getEnvConfig).mockReturnValue({
				databaseId: "test-db",
				collections: {
					typing: null,
				},
			} as never);

			const request = new NextRequest(
				"http://localhost:3000/api/typing?channelId=channel-123",
				{
					method: "DELETE",
				}
			);

			const response = await DELETE(request);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.error).toBe("Typing collection not configured");
		});
	});
});
