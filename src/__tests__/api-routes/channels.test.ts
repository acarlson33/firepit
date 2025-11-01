/**
 * Tests for GET /api/channels endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/channels/route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		databases: {
			listDocuments: vi.fn(),
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			channels: "channels-collection",
		},
	})),
}));

import { getServerClient } from "@/lib/appwrite-server";

describe("GET /api/channels", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return 400 if serverId is missing", async () => {
		const request = new NextRequest("http://localhost:3000/api/channels");

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe("serverId is required");
	});

	it("should fetch channels for a given serverId", async () => {
		const mockChannels = [
			{
				$id: "channel1",
				serverId: "server1",
				name: "general",
				$createdAt: "2024-01-01T00:00:00.000Z",
			},
			{
				$id: "channel2",
				serverId: "server1",
				name: "random",
				$createdAt: "2024-01-02T00:00:00.000Z",
			},
		];

		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: mockChannels,
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channels).toHaveLength(2);
		expect(data.channels[0].$id).toBe("channel1");
		expect(data.channels[1].$id).toBe("channel2");
		expect(data.nextCursor).toBeNull();
	});

	it("should apply default limit of 50", async () => {
		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: [],
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		await GET(request);

		expect(mockListDocuments).toHaveBeenCalledWith(
			"test-db",
			"channels-collection",
			expect.arrayContaining([expect.stringContaining("limit")])
		);
	});

	it("should use custom limit if provided", async () => {
		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: [],
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1&limit=10"
		);

		await GET(request);

		expect(mockListDocuments).toHaveBeenCalledWith(
			"test-db",
			"channels-collection",
			expect.arrayContaining([expect.stringContaining("limit")])
		);
	});

	it("should return nextCursor when results match limit", async () => {
		const mockChannels = Array.from({ length: 10 }, (_, i) => ({
			$id: `channel${i}`,
			serverId: "server1",
			name: `channel-${i}`,
			$createdAt: `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
		}));

		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: mockChannels,
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1&limit=10"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channels).toHaveLength(10);
		expect(data.nextCursor).toBe("channel9");
	});

	it("should return null nextCursor when results are less than limit", async () => {
		const mockChannels = [
			{
				$id: "channel1",
				serverId: "server1",
				name: "general",
				$createdAt: "2024-01-01T00:00:00.000Z",
			},
		];

		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: mockChannels,
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1&limit=10"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channels).toHaveLength(1);
		expect(data.nextCursor).toBeNull();
	});

	it("should use cursor for pagination", async () => {
		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: [],
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1&cursor=channel5"
		);

		await GET(request);

		expect(mockListDocuments).toHaveBeenCalledWith(
			"test-db",
			"channels-collection",
			expect.arrayContaining([expect.stringContaining("cursorAfter")])
		);
	});

	it("should handle database errors gracefully", async () => {
		const mockListDocuments = vi
			.fn()
			.mockRejectedValue(new Error("Database connection failed"));

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Database connection failed");
	});

	it("should handle non-Error exceptions", async () => {
		const mockListDocuments = vi.fn().mockRejectedValue("Unknown error");

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to fetch channels");
	});

	it("should return empty array when no channels exist", async () => {
		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: [],
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channels).toEqual([]);
		expect(data.nextCursor).toBeNull();
	});

	it("should handle channels with missing $createdAt", async () => {
		const mockChannels = [
			{
				$id: "channel1",
				serverId: "server1",
				name: "general",
				// Missing $createdAt
			},
		];

		const mockListDocuments = vi.fn().mockResolvedValue({
			documents: mockChannels,
		});

		(getServerClient as ReturnType<typeof vi.fn>).mockReturnValue({
			databases: {
				listDocuments: mockListDocuments,
			},
		});

		const request = new NextRequest(
			"http://localhost:3000/api/channels?serverId=server1"
		);

		const response = await GET(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.channels[0].$createdAt).toBe("");
	});
});
