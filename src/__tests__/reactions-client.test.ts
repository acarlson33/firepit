import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	addReaction,
	removeReaction,
	toggleReaction,
} from "@/lib/reactions-client";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Reactions Client", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("addReaction", () => {
		it("should add a reaction to a channel message", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [{ emoji: "👍", userIds: ["user-1"], count: 1 }],
				}),
			});

			const result = await addReaction("msg-1", "👍", false);

			expect(result.success).toBe(true);
			expect(result.reactions).toHaveLength(1);
			expect(mockFetch).toHaveBeenCalledWith("/api/messages/msg-1/reactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ emoji: "👍" }),
			});
		});

		it("should add a reaction to a DM", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [{ emoji: "❤️", userIds: ["user-1"], count: 1 }],
				}),
			});

			const result = await addReaction("msg-2", "❤️", true);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/direct-messages/msg-2/reactions",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ emoji: "❤️" }),
				})
			);
		});

		it("should throw error when API returns error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Unauthorized" }),
			});

			await expect(addReaction("msg-1", "👍")).rejects.toThrow("Unauthorized");
		});

		it("should throw generic error when no error message provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({}),
			});

			await expect(addReaction("msg-1", "👍")).rejects.toThrow(
				"Failed to add reaction"
			);
		});
	});

	describe("removeReaction", () => {
		it("should remove a reaction from a channel message", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [],
				}),
			});

			const result = await removeReaction("msg-1", "👍", false);

			expect(result.success).toBe(true);
			expect(result.reactions).toHaveLength(0);
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D",
				{
					method: "DELETE",
				}
			);
		});

		it("should remove a reaction from a DM", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [],
				}),
			});

			const result = await removeReaction("msg-2", "❤️", true);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/direct-messages/msg-2/reactions?emoji="),
				{
					method: "DELETE",
				}
			);
		});

		it("should URL encode the emoji parameter", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			await removeReaction("msg-1", "🎉", false);

			const callUrl = mockFetch.mock.calls[0][0];
			expect(callUrl).toContain("emoji=%F0%9F%8E%89");
		});

		it("should throw error when API returns error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Not found" }),
			});

			await expect(removeReaction("msg-1", "👍")).rejects.toThrow("Not found");
		});
	});

	describe("toggleReaction", () => {
		it("should add reaction when isAdding is true", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [{ emoji: "🔥", userIds: ["user-1"], count: 1 }],
				}),
			});

			const result = await toggleReaction("msg-1", "🔥", true, false);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/messages/msg-1/reactions",
				expect.objectContaining({
					method: "POST",
				})
			);
		});

		it("should remove reaction when isAdding is false", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					reactions: [],
				}),
			});

			const result = await toggleReaction("msg-1", "🔥", false, false);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/messages/msg-1/reactions?emoji="),
				expect.objectContaining({
					method: "DELETE",
				})
			);
		});

		it("should work with DMs when isDM is true", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			await toggleReaction("msg-1", "😊", true, true);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/direct-messages/"),
				expect.any(Object)
			);
		});
	});
});
