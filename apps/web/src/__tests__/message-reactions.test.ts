import { describe, expect, it } from "vitest";

// Helper functions that mirror the API logic
function parseReactions(reactionsData: string | any[] | undefined): Array<{
	emoji: string;
	userIds: string[];
	count: number;
}> {
	if (!reactionsData) return [];
	
	if (typeof reactionsData === "string") {
		try {
			return JSON.parse(reactionsData);
		} catch {
			return [];
		}
	}
	
	if (Array.isArray(reactionsData)) {
		return reactionsData;
	}
	
	return [];
}

function addReactionToMessage(
	reactions: Array<{ emoji: string; userIds: string[]; count: number }>,
	emoji: string,
	userId: string
): Array<{ emoji: string; userIds: string[]; count: number }> {
	const existingReaction = reactions.find((r) => r.emoji === emoji);
	
	if (existingReaction) {
		if (!existingReaction.userIds.includes(userId)) {
			existingReaction.userIds.push(userId);
			existingReaction.count = existingReaction.userIds.length;
		}
	} else {
		reactions.push({
			emoji,
			userIds: [userId],
			count: 1,
		});
	}
	
	return reactions;
}

function removeReactionFromMessage(
	reactions: Array<{ emoji: string; userIds: string[]; count: number }>,
	emoji: string,
	userId: string
): Array<{ emoji: string; userIds: string[]; count: number }> {
	const existingReaction = reactions.find((r) => r.emoji === emoji);
	
	if (existingReaction) {
		existingReaction.userIds = existingReaction.userIds.filter((id) => id !== userId);
		
		if (existingReaction.userIds.length === 0) {
			return reactions.filter((r) => r.emoji !== emoji);
		}
		
		existingReaction.count = existingReaction.userIds.length;
	}
	
	return reactions;
}

describe("Message Reactions", () => {
	describe("Reaction Parsing", () => {
		it("should parse JSON string reactions", () => {
			const reactionsString = JSON.stringify([
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			]);
			
			const reactions = parseReactions(reactionsString);
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].emoji).toBe("👍");
			expect(reactions[0].userIds).toContain("user1");
		});

		it("should handle array reactions (backwards compatibility)", () => {
			const reactionsArray = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			const reactions = parseReactions(reactionsArray);
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].emoji).toBe("👍");
		});

		it("should return empty array for undefined", () => {
			const reactions = parseReactions(undefined);
			expect(reactions).toHaveLength(0);
		});

		it("should return empty array for invalid JSON", () => {
			const reactions = parseReactions("invalid json");
			expect(reactions).toHaveLength(0);
		});

		it("should handle empty array string", () => {
			const reactions = parseReactions("[]");
			expect(reactions).toHaveLength(0);
		});
	});

	describe("Adding Reactions", () => {
		it("should add a new reaction to empty array", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];
			
			reactions = addReactionToMessage(reactions, "👍", "user1");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].emoji).toBe("👍");
			expect(reactions[0].userIds).toContain("user1");
			expect(reactions[0].count).toBe(1);
		});

		it("should add user to existing reaction", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			reactions = addReactionToMessage(reactions, "👍", "user2");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].userIds).toHaveLength(2);
			expect(reactions[0].userIds).toContain("user2");
			expect(reactions[0].count).toBe(2);
		});

		it("should not add duplicate user to same reaction", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			reactions = addReactionToMessage(reactions, "👍", "user1");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].userIds).toHaveLength(1);
			expect(reactions[0].count).toBe(1);
		});

		it("should add different emoji reactions to same message", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			reactions = addReactionToMessage(reactions, "❤️", "user2");
			
			expect(reactions).toHaveLength(2);
			expect(reactions[0].emoji).toBe("👍");
			expect(reactions[1].emoji).toBe("❤️");
		});

		it("should handle multiple users on different reactions", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];
			
			reactions = addReactionToMessage(reactions, "👍", "user1");
			reactions = addReactionToMessage(reactions, "👍", "user2");
			reactions = addReactionToMessage(reactions, "❤️", "user3");
			
			expect(reactions).toHaveLength(2);
			expect(reactions[0].count).toBe(2);
			expect(reactions[1].count).toBe(1);
		});

		it("should handle special emoji characters", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];
			
			const specialEmojis = ["🎉", "🔥", "👀", "😂", "🚀"];
			specialEmojis.forEach((emoji, index) => {
				reactions = addReactionToMessage(reactions, emoji, `user${index + 1}`);
			});
			
			expect(reactions).toHaveLength(5);
			reactions.forEach((reaction, index) => {
				expect(reaction.emoji).toBe(specialEmojis[index]);
			});
		});
	});

	describe("Removing Reactions", () => {
		it("should remove user from reaction", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1", "user2"], count: 2 },
			];
			
			reactions = removeReactionFromMessage(reactions, "👍", "user1");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].userIds).toHaveLength(1);
			expect(reactions[0].userIds).not.toContain("user1");
			expect(reactions[0].count).toBe(1);
		});

		it("should remove reaction entirely when last user is removed", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
				{ emoji: "❤️", userIds: ["user2"], count: 1 },
			];
			
			reactions = removeReactionFromMessage(reactions, "👍", "user1");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].emoji).toBe("❤️");
		});

		it("should handle removing non-existent user", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			reactions = removeReactionFromMessage(reactions, "👍", "user2");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].userIds).toHaveLength(1);
			expect(reactions[0].count).toBe(1);
		});

		it("should handle removing non-existent emoji", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];
			
			reactions = removeReactionFromMessage(reactions, "❤️", "user1");
			
			expect(reactions).toHaveLength(1);
			expect(reactions[0].emoji).toBe("👍");
		});

		it("should handle empty reactions array", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];
			
			reactions = removeReactionFromMessage(reactions, "👍", "user1");
			
			expect(reactions).toHaveLength(0);
		});
	});

	describe("JSON Serialization", () => {
		it("should serialize reactions as JSON string", () => {
			const reactions = [
				{ emoji: "👍", userIds: ["user1", "user2"], count: 2 },
				{ emoji: "❤️", userIds: ["user3"], count: 1 },
			];

			const serialized = JSON.stringify(reactions);
			expect(typeof serialized).toBe("string");

			const deserialized = JSON.parse(serialized);
			expect(deserialized).toEqual(reactions);
		});

		it("should handle special characters in emoji", () => {
			const reactions = [
				{ emoji: "🎉", userIds: ["user1"], count: 1 },
				{ emoji: "🔥", userIds: ["user2"], count: 1 },
			];

			const serialized = JSON.stringify(reactions);
			const deserialized = JSON.parse(serialized);

			expect(deserialized[0].emoji).toBe("🎉");
			expect(deserialized[1].emoji).toBe("🔥");
		});

		it("should handle empty reactions array serialization", () => {
			const reactions: any[] = [];
			const serialized = JSON.stringify(reactions);
			expect(serialized).toBe("[]");

			const deserialized = JSON.parse(serialized);
			expect(Array.isArray(deserialized)).toBe(true);
			expect(deserialized).toHaveLength(0);
		});

		it("should maintain data integrity through serialize/deserialize cycle", () => {
			const reactions = [
				{ emoji: "👍", userIds: ["user1", "user2", "user3"], count: 3 },
			];

			const serialized = JSON.stringify(reactions);
			const deserialized = JSON.parse(serialized);

			expect(deserialized[0].emoji).toBe(reactions[0].emoji);
			expect(deserialized[0].userIds).toEqual(reactions[0].userIds);
			expect(deserialized[0].count).toBe(reactions[0].count);
		});

		it("should handle large reaction arrays", () => {
			const userIds = Array.from({ length: 100 }, (_, i) => `user${i + 1}`);
			const reactions = [
				{ emoji: "👍", userIds, count: 100 },
			];

			const serialized = JSON.stringify(reactions);
			const deserialized = JSON.parse(serialized);

			expect(deserialized[0].userIds).toHaveLength(100);
			expect(deserialized[0].count).toBe(100);
		});
	});

	describe("Authorization", () => {
		it("should verify user is part of DM conversation (sender)", () => {
			const message = {
				senderId: "user1",
				receiverId: "user2",
			};
			const currentUserId = "user1";

			const isAuthorized =
				message.senderId === currentUserId || message.receiverId === currentUserId;

			expect(isAuthorized).toBe(true);
		});

		it("should verify user is part of DM conversation (receiver)", () => {
			const message = {
				senderId: "user1",
				receiverId: "user2",
			};
			const currentUserId = "user2";

			const isAuthorized =
				message.senderId === currentUserId || message.receiverId === currentUserId;

			expect(isAuthorized).toBe(true);
		});

		it("should reject user not part of DM conversation", () => {
			const message = {
				senderId: "user1",
				receiverId: "user2",
			};
			const currentUserId = "user3";

			const isAuthorized =
				message.senderId === currentUserId || message.receiverId === currentUserId;

			expect(isAuthorized).toBe(false);
		});
	});

	describe("Edge Cases", () => {
		it("should handle reaction with zero count after removal", () => {
			let reactions = [
				{ emoji: "👍", userIds: ["user1"], count: 1 },
			];

			reactions = removeReactionFromMessage(reactions, "👍", "user1");

			expect(reactions).toHaveLength(0);
		});

		it("should handle very long user ID arrays", () => {
			const userIds = Array.from({ length: 100 }, (_, i) => `user${i + 1}`);
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];

			userIds.forEach((userId) => {
				reactions = addReactionToMessage(reactions, "🎉", userId);
			});

			expect(reactions).toHaveLength(1);
			expect(reactions[0].count).toBe(100);
			expect(reactions[0].userIds).toHaveLength(100);
		});

		it("should maintain consistency between userIds length and count", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];

			reactions = addReactionToMessage(reactions, "👍", "user1");
			reactions = addReactionToMessage(reactions, "👍", "user2");
			reactions = addReactionToMessage(reactions, "👍", "user3");

			expect(reactions[0].userIds).toHaveLength(reactions[0].count);

			reactions = removeReactionFromMessage(reactions, "👍", "user2");

			expect(reactions[0].userIds).toHaveLength(reactions[0].count);
		});

		it("should handle adding and removing same user multiple times", () => {
			let reactions: Array<{ emoji: string; userIds: string[]; count: number }> = [];

			reactions = addReactionToMessage(reactions, "👍", "user1");
			reactions = addReactionToMessage(reactions, "👍", "user1"); // Duplicate, should not add
			reactions = removeReactionFromMessage(reactions, "👍", "user1");
			reactions = addReactionToMessage(reactions, "👍", "user1");

			expect(reactions).toHaveLength(1);
			expect(reactions[0].count).toBe(1);
			expect(reactions[0].userIds).toContain("user1");
		});
	});
});
