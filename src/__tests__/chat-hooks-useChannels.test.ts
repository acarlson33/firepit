/**
 * @vitest-environment happy-dom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChannels } from "@/app/chat/hooks/useChannels";
import * as appwriteServers from "@/lib/appwrite-servers";
import { apiCache } from "@/lib/cache-utils";
import type { Channel, Server } from "@/lib/types";

// Mock dependencies
vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

// Mock the appwrite modules before they're imported
vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		endpoint: "https://cloud.appwrite.io/v1",
		project: "test-project",
		databaseId: "test-db",
		collections: {
			servers: "servers",
			memberships: "memberships",
			channels: "channels",
			messages: "messages",
			typing: "typing",
		},
	})),
	AppwriteIntegrationError: class extends Error {},
}));

vi.mock("@/lib/appwrite-servers", () => ({
	createServer: vi.fn(),
	deleteServer: vi.fn(),
	joinServer: vi.fn(),
	createChannel: vi.fn(),
	deleteChannel: vi.fn(),
}));

vi.mock("@/lib/cache-utils", () => ({
	apiCache: {
		swr: vi.fn((key: string, fn: () => Promise<unknown>) => fn()),
		clear: vi.fn(),
		dedupe: vi.fn((key: string, fn: () => Promise<unknown>) => fn()),
	},
	CACHE_TTL: {
		CHANNELS: 60000,
		SERVERS: 60000,
		MEMBERSHIPS: 60000,
	},
}));

describe("useChannels", () => {
	const mockUserId = "user123";
	const mockServerId = "server123";

	const mockChannel1: Channel = {
		$id: "channel1",
		name: "general",
		serverId: mockServerId,
		$createdAt: "2024-01-01T00:00:00.000Z",
		$updatedAt: "2024-01-01T00:00:00.000Z",
	};

	const mockChannel2: Channel = {
		$id: "channel2",
		name: "random",
		serverId: mockServerId,
		$createdAt: "2024-01-02T00:00:00.000Z",
		$updatedAt: "2024-01-02T00:00:00.000Z",
	};

	const mockServer: Server = {
		$id: mockServerId,
		name: "Test Server",
		ownerId: mockUserId,
		$createdAt: "2024-01-01T00:00:00.000Z",
		$updatedAt: "2024-01-01T00:00:00.000Z",
		memberCount: 10,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe("Initial Load", () => {
		it("should load channels successfully", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1, mockChannel2],
					nextCursor: null,
				}),
			});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1, mockChannel2]);
			});

			expect(result.current.cursor).toBeNull();
			expect(apiCache.swr).toHaveBeenCalledWith(
				`channels:${mockServerId}:initial`,
				expect.any(Function),
				expect.any(Number),
				expect.any(Function)
			);
		});

		it("should handle null selectedServer", async () => {
			const { result } = renderHook(() =>
				useChannels({
					selectedServer: null,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			expect(result.current.channels).toEqual([]);
			expect(result.current.cursor).toBeNull();
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it("should reload channels when selectedServer changes", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel1],
						nextCursor: null,
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel2],
						nextCursor: null,
					}),
				});

			const { result, rerender } = renderHook(
				({ selectedServer }: { selectedServer: string | null }) =>
					useChannels({
						selectedServer,
						userId: mockUserId,
						servers: [mockServer],
					}),
				{
					initialProps: { selectedServer: mockServerId as string | null },
				}
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			rerender({ selectedServer: "server2" });

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel2]);
			});

			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		it("should clear channels when selectedServer becomes null", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1, mockChannel2],
					nextCursor: null,
				}),
			});

			const { result, rerender } = renderHook(
				({ selectedServer }: { selectedServer: string | null }) =>
					useChannels({
						selectedServer,
						userId: mockUserId,
						servers: [mockServer],
					}),
				{
					initialProps: { selectedServer: mockServerId as string | null },
				}
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1, mockChannel2]);
			});

			rerender({ selectedServer: null });

			expect(result.current.channels).toEqual([]);
			expect(result.current.cursor).toBeNull();
		});

		it("should handle load error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("Network error")
			);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([]);
			});
		});

		it("should use SWR caching with callback", async () => {
			const mockSwrCallback = vi.fn();
			
			(apiCache.swr as ReturnType<typeof vi.fn>).mockImplementationOnce(
				async (key: string, fn: () => Promise<unknown>, ttl: number, callback: (data: unknown) => void) => {
					const data = await fn();
					callback(data);
					return data;
				}
			);

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(apiCache.swr).toHaveBeenCalled();
			});
		});
	});

	describe("Load More", () => {
		it("should load more channels with cursor", async () => {
			const mockChannel3: Channel = {
				$id: "channel3",
				name: "announcements",
				serverId: mockServerId,
				$createdAt: "2024-01-03T00:00:00.000Z",
				$updatedAt: "2024-01-03T00:00:00.000Z",
			};

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel1, mockChannel2],
						nextCursor: "cursor123",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel3],
						nextCursor: null,
					}),
				});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1, mockChannel2]);
			});

			expect(result.current.cursor).toBe("cursor123");

			await act(async () => {
				await result.current.loadMore();
			});

			expect(result.current.channels).toEqual([mockChannel1, mockChannel2, mockChannel3]);
			expect(result.current.cursor).toBeNull();
			expect(result.current.loading).toBe(false);
		});

		it("should not load more if no cursor", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			const fetchCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

			await act(async () => {
				await result.current.loadMore();
			});

			expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallCount);
		});

		it("should not load more if already loading", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel1],
						nextCursor: "cursor123",
					}),
				})
				.mockImplementationOnce(
					() =>
						new Promise((resolve) => {
							setTimeout(() => {
								resolve({
									ok: true,
									json: async () => ({
										channels: [mockChannel2],
										nextCursor: null,
									}),
								});
							}, 100);
						})
				);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			// Start loading more
			void act(() => {
				void result.current.loadMore();
			});

			// Try to load more again while first is still loading
			await act(async () => {
				await result.current.loadMore();
			});

			// Should only have called fetch twice (initial + first loadMore)
			await waitFor(() => {
				expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
			});
		});

		it("should not load more if no selectedServer", async () => {
			const { result } = renderHook(() =>
				useChannels({
					selectedServer: null,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await act(async () => {
				await result.current.loadMore();
			});

			expect(global.fetch).not.toHaveBeenCalled();
		});

		it("should handle loadMore error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						channels: [mockChannel1],
						nextCursor: "cursor123",
					}),
				})
				.mockRejectedValueOnce(new Error("Load more failed"));

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			await act(async () => {
				await result.current.loadMore();
			});

			// Should still have original channel
			expect(result.current.channels).toEqual([mockChannel1]);
			expect(result.current.loading).toBe(false);
		});
	});

	describe("Create Channel", () => {
		it("should create a channel successfully", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const newChannel: Channel = {
				$id: "new-channel",
				name: "new-channel",
				serverId: mockServerId,
				$createdAt: "2024-01-04T00:00:00.000Z",
				$updatedAt: "2024-01-04T00:00:00.000Z",
			};

			(appwriteServers.createChannel as ReturnType<typeof vi.fn>).mockResolvedValue(newChannel);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			let createdChannel: Channel | null = null;
			await act(async () => {
				createdChannel = await result.current.create("new-channel");
			});

			expect(createdChannel).toEqual(newChannel);
			expect(result.current.channels).toContain(newChannel);
			expect(apiCache.clear).toHaveBeenCalledWith(`channels:${mockServerId}:initial`);
		});

		it("should return null if no userId", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: null,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			let createdChannel: Channel | null = null;
			await act(async () => {
				createdChannel = await result.current.create("new-channel");
			});

			expect(createdChannel).toBeNull();
			expect(appwriteServers.createChannel).not.toHaveBeenCalled();
		});

		it("should return null if no selectedServer", async () => {
			const { result } = renderHook(() =>
				useChannels({
					selectedServer: null,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			let createdChannel: Channel | null = null;
			await act(async () => {
				createdChannel = await result.current.create("new-channel");
			});

			expect(createdChannel).toBeNull();
			expect(appwriteServers.createChannel).not.toHaveBeenCalled();
		});

		it("should handle create error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			(appwriteServers.createChannel as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Create failed")
			);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			await expect(
				act(async () => {
					await result.current.create("new-channel");
				})
			).rejects.toThrow("Create failed");
		});
	});

	describe("Delete Channel", () => {
		it("should delete a channel successfully", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1, mockChannel2],
					nextCursor: null,
				}),
			});

			(appwriteServers.deleteChannel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toHaveLength(2);
			});

			await act(async () => {
				await result.current.remove(mockChannel2);
			});

			expect(result.current.channels).toEqual([mockChannel1]);
			expect(apiCache.clear).toHaveBeenCalledWith(`channels:${mockServerId}:initial`);
		});

		it("should handle delete when no selectedServer", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			(appwriteServers.deleteChannel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const { result, rerender } = renderHook(
				({ selectedServer }: { selectedServer: string | null }) =>
					useChannels({
						selectedServer,
						userId: mockUserId,
						servers: [mockServer],
					}),
				{
					initialProps: { selectedServer: mockServerId as string | null },
				}
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			// Change to no server
			rerender({ selectedServer: null });

			await act(async () => {
				await result.current.remove(mockChannel1);
			});

			// Should not call cache clear without selectedServer
			expect(apiCache.clear).not.toHaveBeenCalled();
		});

		it("should handle delete error", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			(appwriteServers.deleteChannel as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Delete failed")
			);

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			await expect(
				act(async () => {
					await result.current.remove(mockChannel1);
				})
			).rejects.toThrow("Delete failed");

			// Channel should still be in list
			expect(result.current.channels).toEqual([mockChannel1]);
		});
	});

	describe("isOwner", () => {
		it("should return true if user is server owner", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			expect(result.current.isOwner(mockServerId)).toBe(true);
		});

		it("should return false if user is not server owner", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const otherServer: Server = {
				$id: "other-server",
				name: "Other Server",
				ownerId: "other-user",
				$createdAt: "2024-01-01T00:00:00.000Z",
				$updatedAt: "2024-01-01T00:00:00.000Z",
				memberCount: 5,
			};

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer, otherServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			expect(result.current.isOwner("other-server")).toBe(false);
		});

		it("should return false if server not found", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					channels: [mockChannel1],
					nextCursor: null,
				}),
			});

			const { result } = renderHook(() =>
				useChannels({
					selectedServer: mockServerId,
					userId: mockUserId,
					servers: [mockServer],
				})
			);

			await waitFor(() => {
				expect(result.current.channels).toEqual([mockChannel1]);
			});

			expect(result.current.isOwner("nonexistent-server")).toBe(false);
		});
	});
});
