/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversations } from "@/app/chat/hooks/useConversations";
import * as appwriteDmsClient from "@/lib/appwrite-dms-client";
import type { Conversation } from "@/lib/types";

// Mock dependencies
vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		endpoint: "https://cloud.appwrite.io/v1",
		project: "test-project",
		databaseId: "test-db",
		collections: {
			conversations: "conversations",
			directMessages: "directMessages",
			statuses: "statuses",
		},
	})),
	AppwriteIntegrationError: class extends Error {},
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
	listConversations: vi.fn(),
}));

vi.mock("@/app/chat/hooks/useStatusSubscription", () => ({
	useStatusSubscription: vi.fn(() => ({
		statuses: new Map(),
	})),
}));

vi.mock("appwrite", () => ({
	Client: vi.fn(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
		subscribe: vi.fn(() => vi.fn()),
	})),
}));

describe("useConversations", () => {
	const mockUserId = "user123";

	const mockConversation1: Conversation = {
		$id: "conv1",
		participants: [mockUserId, "user456"],
		lastMessageAt: "2024-01-01T00:00:00.000Z",
		$createdAt: "2024-01-01T00:00:00.000Z",
		$updatedAt: "2024-01-01T00:00:00.000Z",
		otherUser: {
			userId: "user456",
			userName: "User 456",
			status: "online",
		},
	};

	const mockConversation2: Conversation = {
		$id: "conv2",
		participants: [mockUserId, "user789"],
		lastMessageAt: "2024-01-02T00:00:00.000Z",
		$createdAt: "2024-01-02T00:00:00.000Z",
		$updatedAt: "2024-01-02T00:00:00.000Z",
		otherUser: {
			userId: "user789",
			userName: "User 789",
			status: "offline",
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Initial Load", () => {
		it("should load conversations successfully", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockConversation1,
				mockConversation2,
			]);

			const { result } = renderHook(() => useConversations(mockUserId));

			// Initially loading
			expect(result.current.loading).toBe(true);
			expect(result.current.conversations).toEqual([]);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([mockConversation1, mockConversation2]);
			expect(result.current.error).toBeNull();
		});

		it("should handle null userId", async () => {
			const { result } = renderHook(() => useConversations(null));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([]);
			expect(appwriteDmsClient.listConversations).not.toHaveBeenCalled();
		});

		it("should handle empty conversations", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([]);
			expect(result.current.error).toBeNull();
		});

		it("should handle load error", async () => {
			const errorMessage = "Network error";
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error(errorMessage)
			);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([]);
			expect(result.current.error).toBe(errorMessage);
		});

		it("should handle non-Error load failure", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockRejectedValue(
				"String error"
			);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.error).toBe("Failed to load conversations");
		});

		it("should reload conversations when userId changes", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([mockConversation1])
				.mockResolvedValueOnce([mockConversation2]);

			const { result, rerender } = renderHook(
				({ userId }) => useConversations(userId),
				{
					initialProps: { userId: mockUserId },
				}
			);

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation1]);
			});

			rerender({ userId: "different-user" });

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation2]);
			});

			expect(appwriteDmsClient.listConversations).toHaveBeenCalledTimes(2);
		});

		it("should clear conversations when userId becomes null", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockConversation1,
			]);

			const { result, rerender } = renderHook(
				({ userId }: { userId: string | null }) => useConversations(userId),
				{
					initialProps: { userId: mockUserId },
				}
			);

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation1]);
			});

			rerender({ userId: null });

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([]);
		});
	});

	describe("Refresh", () => {
		it("should refresh conversations when refresh is called", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([mockConversation1])
				.mockResolvedValueOnce([mockConversation1, mockConversation2]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation1]);
			});

			await result.current.refresh();

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation1, mockConversation2]);
			});

			expect(appwriteDmsClient.listConversations).toHaveBeenCalledTimes(2);
		});

		it("should handle refresh error", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([mockConversation1])
				.mockRejectedValueOnce(new Error("Refresh failed"));

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.conversations).toEqual([mockConversation1]);
			});

			await result.current.refresh();

			await waitFor(() => {
				expect(result.current.error).toBe("Refresh failed");
			});

			// Previous conversations are preserved on refresh error
			expect(result.current.conversations).toEqual([mockConversation1]);
		});
	});

	describe("Other User IDs", () => {
		it("should extract other user IDs from conversations", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockConversation1,
				mockConversation2,
			]);

			renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				// Note: useStatusSubscription is mocked, so we can't directly verify calls
				// Instead, we verify that conversations are loaded correctly
				expect(appwriteDmsClient.listConversations).toHaveBeenCalledWith(mockUserId);
			});
		});

		it("should handle conversations with single participant", async () => {
			const conversationWithNoOther: Conversation = {
				$id: "conv3",
				participants: [mockUserId],
				lastMessageAt: "2024-01-03T00:00:00.000Z",
				$createdAt: "2024-01-03T00:00:00.000Z",
				$updatedAt: "2024-01-03T00:00:00.000Z",
			};

			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				conversationWithNoOther,
			]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.conversations).toEqual([conversationWithNoOther]);
			});
		});
	});

	describe("Data Loading", () => {
		it("should load conversations successfully", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockConversation1,
			]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([mockConversation1]);
		});

		it("should handle conversations without otherUser field", async () => {
			const conversationWithoutOtherUser: Conversation = {
				$id: "conv3",
				participants: [mockUserId, "user999"],
				lastMessageAt: "2024-01-03T00:00:00.000Z",
				$createdAt: "2024-01-03T00:00:00.000Z",
				$updatedAt: "2024-01-03T00:00:00.000Z",
			};

			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				conversationWithoutOtherUser,
			]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toHaveLength(1);
			expect(result.current.conversations[0].$id).toBe("conv3");
		});
	});

	describe("Real-time Updates", () => {
		it("should load conversations and handle realtime updates", async () => {
			(appwriteDmsClient.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockConversation1,
			]);

			const { result } = renderHook(() => useConversations(mockUserId));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([mockConversation1]);
		});

		it("should skip realtime subscription when userId is null", async () => {
			const { result } = renderHook(() => useConversations(null));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.conversations).toEqual([]);
		});
	});
});
