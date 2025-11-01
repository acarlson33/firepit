/**
 * @vitest-environment happy-dom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessages } from "@/app/chat/hooks/useMessages";
import * as appwriteMessages from "@/lib/appwrite-messages";
import * as appwriteMessagesEnriched from "@/lib/appwrite-messages-enriched";
import type { Message } from "@/lib/types";

// Mock dependencies
vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		endpoint: "https://cloud.appwrite.io/v1",
		project: "test-project",
		databaseId: "test-db",
		collections: {
			messages: "messages",
			typing: "typing",
		},
	})),
}));

vi.mock("@/lib/appwrite-messages", () => ({
	canSend: vi.fn(),
	setTyping: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/appwrite-messages-enriched", () => ({
	getEnrichedMessages: vi.fn(),
}));

vi.mock("@/lib/reactions-utils", () => ({
	parseReactions: vi.fn((reactions) => reactions || {}),
}));

vi.mock("@/lib/mention-utils", () => ({
	extractMentionedUsernames: vi.fn(() => []),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("useMessages", () => {
	const mockUserId = "user123";
	const mockUserName = "Test User";
	const mockChannelId = "channel123";
	const mockServerId = "server123";

	const mockMessage1: Message = {
		$id: "msg1",
		channelId: mockChannelId,
		userId: mockUserId,
		userName: mockUserName,
		text: "Hello",
		$createdAt: "2024-01-01T00:00:00.000Z",
		$updatedAt: "2024-01-01T00:00:00.000Z",
		reactions: {},
	};

	const mockMessage2: Message = {
		$id: "msg2",
		channelId: mockChannelId,
		userId: "user456",
		userName: "Other User",
		text: "Hi there",
		$createdAt: "2024-01-01T00:01:00.000Z",
		$updatedAt: "2024-01-01T00:01:00.000Z",
		reactions: {},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Message Loading", () => {
		it("should load messages when channelId is provided", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
				mockMessage2,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
					serverId: mockServerId,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1, mockMessage2]);
			});
		});

		it("should clear messages when channelId is null", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result, rerender } = renderHook(
				({ channelId }: { channelId: string | null }) =>
					useMessages({
						channelId,
						userId: mockUserId,
						userName: mockUserName,
					}),
				{
					initialProps: { channelId: mockChannelId as string | null },
				},
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			rerender({ channelId: null });

			expect(result.current.messages).toEqual([]);
		});

		it("should handle load errors", async () => {
			const { toast } = await import("sonner");
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Load failed"),
			);

			renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(toast.error).toHaveBeenCalledWith("Load failed");
			});
		});

		it("should reload messages when channelId changes", async () => {
			const mockMessage3: Message = {
				$id: "msg3",
				channelId: "channel456",
				userId: mockUserId,
				userName: mockUserName,
				text: "New channel",
				$createdAt: "2024-01-01T00:02:00.000Z",
				$updatedAt: "2024-01-01T00:02:00.000Z",
				reactions: {},
			};

			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([mockMessage1])
				.mockResolvedValueOnce([mockMessage3]);

			const { result, rerender } = renderHook(
				({ channelId }: { channelId: string | null }) =>
					useMessages({
						channelId,
						userId: mockUserId,
						userName: mockUserName,
					}),
				{
					initialProps: { channelId: mockChannelId as string | null },
				},
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			rerender({ channelId: "channel456" });

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage3]);
			});
		});

		it("should set hasMore when full page of messages is loaded", async () => {
			const fullPage = Array.from({ length: 30 }, (_, i) => ({
				...mockMessage1,
				$id: `msg${i}`,
			}));

			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue(fullPage);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.hasMore).toBe(true);
			});
		});

		it("should set hasMore to false when less than full page is loaded", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.hasMore).toBe(false);
			});
		});
	});

	describe("Text State", () => {
		it("should update text state", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			act(() => {
				result.current.onChangeText({
					target: { value: "Hello" },
				} as React.ChangeEvent<HTMLInputElement>);
			});

			expect(result.current.text).toBe("Hello");
		});
	});

	describe("Editing State", () => {
		it("should set editing message ID", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.startEdit(mockMessage1);
			});

			expect(result.current.editingMessageId).toBe("msg1");
			expect(result.current.text).toBe("Hello");
		});

		it("should clear editing message ID", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.startEdit(mockMessage1);
			});

			act(() => {
				result.current.cancelEdit();
			});

			expect(result.current.editingMessageId).toBeNull();
			expect(result.current.text).toBe("");
		});
	});

	describe("Reply State", () => {
		it("should set replying to message", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.startReply(mockMessage1);
			});

			expect(result.current.replyingToMessage).toEqual(mockMessage1);
		});

		it("should clear replying to message", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.startReply(mockMessage1);
			});

			act(() => {
				result.current.cancelReply();
			});

			expect(result.current.replyingToMessage).toBeNull();
		});
	});

	describe("Initialization", () => {
		it("should initialize with empty messages", () => {
			const { result } = renderHook(() =>
				useMessages({
					channelId: null,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			expect(result.current.messages).toEqual([]);
			expect(result.current.text).toBe("");
			expect(result.current.editingMessageId).toBeNull();
			expect(result.current.replyingToMessage).toBeNull();
		});

		it("should handle empty message list", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([]);
			});
		});
	});

	describe("Load Older Messages", () => {
		it("should not show load older button when hasMore is false", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.hasMore).toBe(false);
			});

			expect(result.current.shouldShowLoadOlder()).toBe(false);
		});

		it("should show load older button when hasMore is true", async () => {
			const fullPage = Array.from({ length: 30 }, (_, i) => ({
				...mockMessage1,
				$id: `msg${i}`,
			}));

			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue(fullPage);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.hasMore).toBe(true);
			});

			expect(result.current.shouldShowLoadOlder()).toBe(true);
		});

		it("should load older messages when loadOlder is called", async () => {
			const olderMessage: Message = {
				$id: "msg0",
				channelId: mockChannelId,
				userId: mockUserId,
				userName: mockUserName,
				text: "Older message",
				$createdAt: "2023-12-31T23:59:00.000Z",
				$updatedAt: "2023-12-31T23:59:00.000Z",
				reactions: {},
			};

			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([mockMessage1])
				.mockResolvedValueOnce([olderMessage]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			await act(async () => {
				await result.current.loadOlder();
			});

			await waitFor(() => {
				expect(result.current.messages).toEqual([olderMessage, mockMessage1]);
			});
		});

		it("should not load older when channelId is null", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: null,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await act(async () => {
				await result.current.loadOlder();
			});

			// Should not call getEnrichedMessages for load older
			expect(appwriteMessagesEnriched.getEnrichedMessages).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		it("should handle non-Error load failure", async () => {
			const { toast } = await import("sonner");
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockRejectedValue(
				"String error",
			);

			renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(toast.error).toHaveBeenCalledWith("Failed to load messages");
			});
		});

		it("should handle null userId", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: null,
					userName: null,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});
		});

		it("should handle null userName", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: null,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});
		});

		it("should handle messages without reactions", async () => {
			const messageNoReactions: Message = {
				...mockMessage1,
				reactions: undefined,
			};

			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				messageNoReactions,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([messageNoReactions]);
			});
		});

		it("should preserve oldestCursor from initial load", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
				mockMessage2,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.oldestCursor).toBe("msg1");
			});
		});
	});

	describe("Text Editing", () => {
		it("should clear text when editing is canceled", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.onChangeText({
					target: { value: "Typing..." },
				} as React.ChangeEvent<HTMLInputElement>);
			});

			expect(result.current.text).toBe("Typing...");

			act(() => {
				result.current.startEdit(mockMessage1);
			});

			act(() => {
				result.current.cancelEdit();
			});

			expect(result.current.text).toBe("");
		});

		it("should set text to message text when starting edit", async () => {
			(appwriteMessagesEnriched.getEnrichedMessages as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockMessage1,
			]);

			const { result } = renderHook(() =>
				useMessages({
					channelId: mockChannelId,
					userId: mockUserId,
					userName: mockUserName,
				}),
			);

			await waitFor(() => {
				expect(result.current.messages).toEqual([mockMessage1]);
			});

			act(() => {
				result.current.startEdit(mockMessage1);
			});

			expect(result.current.text).toBe("Hello");
		});
	});
});
