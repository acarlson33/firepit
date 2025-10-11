import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock appwrite-messages
vi.mock("../lib/appwrite-messages", () => ({
	listRecentMessages: vi.fn(
		async (pageSize: number, cursor?: string, channelId?: string) => {
			const allMessages = (globalThis as any).__mockMessages || [];
			
			// Filter by channel if provided
			let filtered = channelId
				? allMessages.filter((m: any) => m.channelId === channelId)
				: allMessages;

			// Simple cursor pagination
			if (cursor) {
				const cursorIndex = filtered.findIndex((m: any) => m.$id === cursor);
				filtered = filtered.slice(cursorIndex + 1);
			}

			return filtered.slice(0, pageSize);
		}
	),
}));

// Mock enrich-messages
vi.mock("../lib/enrich-messages", () => ({
	enrichMessagesWithProfiles: vi.fn(async (messages: any[]) => {
		const profiles = (globalThis as any).__mockProfiles || {};
		return messages.map((msg) => ({
			...msg,
			profile: profiles[msg.userId] || null,
		}));
	}),
}));

function setMockMessages(messages: any[]) {
	(globalThis as any).__mockMessages = messages;
}

function setMockProfiles(profiles: Record<string, any>) {
	(globalThis as any).__mockProfiles = profiles;
}

function clearMocks() {
	(globalThis as any).__mockMessages = [];
	(globalThis as any).__mockProfiles = {};
}

describe("appwrite-messages-enriched", () => {
	beforeEach(() => {
		clearMocks();
	});

	describe("getEnrichedMessages", () => {
		it("should fetch and enrich messages", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-1",
					text: "Hello",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
			]);
			setMockProfiles({
				"user-1": {
					$id: "user-1",
					displayName: "Alice",
					username: "alice",
				},
			});

			const result = await getEnrichedMessages(10);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Hello");
			expect((result[0] as any).profile).toEqual({
				$id: "user-1",
				displayName: "Alice",
				username: "alice",
			});
		});

		it("should respect pageSize limit", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			const messages = Array.from({ length: 20 }, (_, i) => ({
				$id: `msg-${i}`,
				userId: "user-1",
				text: `Message ${i}`,
				channelId: "channel-1",
				$createdAt: `2023-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
			}));
			setMockMessages(messages);
			setMockProfiles({
				"user-1": { $id: "user-1", displayName: "User 1", username: "user1" },
			});

			const result = await getEnrichedMessages(5);

			expect(result).toHaveLength(5);
		});

		it("should handle cursor-based pagination", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			const messages = Array.from({ length: 10 }, (_, i) => ({
				$id: `msg-${i}`,
				userId: "user-1",
				text: `Message ${i}`,
				channelId: "channel-1",
				$createdAt: `2023-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
			}));
			setMockMessages(messages);
			setMockProfiles({
				"user-1": { $id: "user-1", displayName: "User 1", username: "user1" },
			});

			const result = await getEnrichedMessages(5, "msg-4");

			expect(result).toHaveLength(5);
			expect(result[0].$id).toBe("msg-5");
		});

		it("should filter by channelId", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-1",
					text: "Channel 1 message",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "msg-2",
					userId: "user-1",
					text: "Channel 2 message",
					channelId: "channel-2",
					$createdAt: "2023-01-01T00:01:00.000Z",
				},
			]);
			setMockProfiles({
				"user-1": { $id: "user-1", displayName: "User 1", username: "user1" },
			});

			const result = await getEnrichedMessages(10, undefined, "channel-1");

			expect(result).toHaveLength(1);
			expect(result[0].channelId).toBe("channel-1");
		});

		it("should handle null channelId", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-1",
					text: "All channels",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "msg-2",
					userId: "user-2",
					text: "All channels too",
					channelId: "channel-2",
					$createdAt: "2023-01-01T00:01:00.000Z",
				},
			]);
			setMockProfiles({
				"user-1": { $id: "user-1", displayName: "User 1", username: "user1" },
				"user-2": { $id: "user-2", displayName: "User 2", username: "user2" },
			});

			const result = await getEnrichedMessages(10, undefined, null);

			// Should get all messages when channelId is null
			expect(result).toHaveLength(2);
		});

		it("should enrich messages from multiple users", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-1",
					text: "Hello from Alice",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "msg-2",
					userId: "user-2",
					text: "Hello from Bob",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:01:00.000Z",
				},
			]);
			setMockProfiles({
				"user-1": {
					$id: "user-1",
					displayName: "Alice",
					username: "alice",
				},
				"user-2": {
					$id: "user-2",
					displayName: "Bob",
					username: "bob",
				},
			});

			const result = await getEnrichedMessages(10);

			expect(result).toHaveLength(2);
			expect((result[0] as any).profile?.displayName).toBe("Alice");
			expect((result[1] as any).profile?.displayName).toBe("Bob");
		});

		it("should handle messages with missing profiles", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-999",
					text: "Message from unknown user",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
			]);
			setMockProfiles({}); // No profiles

			const result = await getEnrichedMessages(10);

			expect(result).toHaveLength(1);
			expect((result[0] as any).profile).toBeNull();
		});

		it("should handle empty message list", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([]);

			const result = await getEnrichedMessages(10);

			expect(result).toHaveLength(0);
		});

		it("should preserve message metadata during enrichment", async () => {
			const { getEnrichedMessages } = await import(
				"../lib/appwrite-messages-enriched"
			);

			setMockMessages([
				{
					$id: "msg-1",
					userId: "user-1",
					text: "Hello",
					channelId: "channel-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
					$updatedAt: "2023-01-01T00:05:00.000Z",
					mentions: ["user-2"],
					reactions: [{ emoji: "👍", userId: "user-2" }],
				},
			]);
			setMockProfiles({
				"user-1": { $id: "user-1", displayName: "User 1", username: "user1" },
			});

			const result = await getEnrichedMessages(10);

			expect(result[0]).toMatchObject({
				$id: "msg-1",
				text: "Hello",
				channelId: "channel-1",
				$createdAt: "2023-01-01T00:00:00.000Z",
				$updatedAt: "2023-01-01T00:05:00.000Z",
				mentions: ["user-2"],
				reactions: [{ emoji: "👍", userId: "user-2" }],
			});
		});
	});
});
