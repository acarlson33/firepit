import { describe, it, expect } from "vitest";
import {
	parseMentions,
	extractMentionedUsernames,
	hasMentions,
	getMentionAtCursor,
	replaceMentionAtCursor,
	MENTION_REGEX,
} from "@/lib/mention-utils";

describe("Mention Utils", () => {
	describe("MENTION_REGEX", () => {
		it("should match simple @username patterns", () => {
			const text = "Hello @john";
			MENTION_REGEX.lastIndex = 0;
			const matches = Array.from(text.matchAll(MENTION_REGEX));
			expect(matches).toHaveLength(1);
			expect(matches[0][0]).toBe("@john");
			expect(matches[0][1]).toBe("john");
		});

		it("should match usernames with dashes and underscores", () => {
			const text = "@user-name @user_name";
			MENTION_REGEX.lastIndex = 0;
			const matches = Array.from(text.matchAll(MENTION_REGEX));
			expect(matches).toHaveLength(2);
			expect(matches[0][1]).toBe("user-name");
			expect(matches[1][1]).toBe("user_name");
		});

		it("should stop at whitespace", () => {
			const text = "@john hello";
			MENTION_REGEX.lastIndex = 0;
			const match = MENTION_REGEX.exec(text);
			expect(match?.[1]).toBe("john");
		});
	});

	describe("parseMentions", () => {
		it("should parse single mention", () => {
			const mentions = parseMentions("Hello @john");
			expect(mentions).toHaveLength(1);
			expect(mentions[0]).toEqual({
				fullMatch: "@john",
				username: "john",
				startIndex: 6,
				endIndex: 11,
			});
		});

		it("should parse multiple mentions", () => {
			const mentions = parseMentions("@alice and @bob are here");
			expect(mentions).toHaveLength(2);
			expect(mentions[0].username).toBe("alice");
			expect(mentions[1].username).toBe("bob");
		});

		it("should return empty array for text without mentions", () => {
			const mentions = parseMentions("No mentions here");
			expect(mentions).toHaveLength(0);
		});

		it("should handle mentions at start and end", () => {
			const mentions = parseMentions("@alice hello world @bob");
			expect(mentions).toHaveLength(2);
			expect(mentions[0].startIndex).toBe(0);
			expect(mentions[1].endIndex).toBe(23);
		});

		it("should handle usernames with special characters", () => {
			const mentions = parseMentions("@user.name @user-123 @user_test");
			expect(mentions).toHaveLength(3);
			expect(mentions[0].username).toBe("user.name");
			expect(mentions[1].username).toBe("user-123");
			expect(mentions[2].username).toBe("user_test");
		});
	});

	describe("extractMentionedUsernames", () => {
		it("should extract usernames from text", () => {
			const usernames = extractMentionedUsernames("@alice @bob @charlie");
			expect(usernames).toEqual(["alice", "bob", "charlie"]);
		});

		it("should return empty array for no mentions", () => {
			const usernames = extractMentionedUsernames("No mentions");
			expect(usernames).toEqual([]);
		});

		it("should extract duplicate mentions", () => {
			const usernames = extractMentionedUsernames("@john @jane @john");
			expect(usernames).toEqual(["john", "jane", "john"]);
		});
	});

	describe("hasMentions", () => {
		it("should return true for text with mentions", () => {
			expect(hasMentions("Hello @john")).toBe(true);
			expect(hasMentions("@alice")).toBe(true);
			expect(hasMentions("text @user more text")).toBe(true);
		});

		it("should return false for text without mentions", () => {
			expect(hasMentions("Hello world")).toBe(false);
			expect(hasMentions("")).toBe(false);
			expect(hasMentions("john smith")).toBe(false);
		});

		it("should return false for @ without username", () => {
			expect(hasMentions("@ ")).toBe(false);
			expect(hasMentions("email@domain.com")).toBe(true); // This matches because @ is followed by domain
		});
	});

	describe("getMentionAtCursor", () => {
		it("should find mention when cursor is after @", () => {
			const mention = getMentionAtCursor("@john", 5);
			expect(mention).toEqual({
				fullMatch: "@john",
				username: "john",
				startIndex: 0,
				endIndex: 5,
			});
		});

		it("should find mention when cursor is in middle of username", () => {
			const mention = getMentionAtCursor("@johndoe", 4);
			expect(mention).toEqual({
				fullMatch: "@johndoe",
				username: "johndoe",
				startIndex: 0,
				endIndex: 8,
			});
		});

		it("should return null when no @ before cursor", () => {
			const mention = getMentionAtCursor("hello world", 5);
			expect(mention).toBeNull();
		});

		it("should return null when whitespace between @ and cursor", () => {
			const mention = getMentionAtCursor("@ john", 5);
			expect(mention).toBeNull();
		});

		it("should handle mention in middle of text", () => {
			const mention = getMentionAtCursor("Hello @john how are you", 11);
			expect(mention).toEqual({
				fullMatch: "@john",
				username: "john",
				startIndex: 6,
				endIndex: 11,
			});
		});

		it("should find partial mention being typed", () => {
			const mention = getMentionAtCursor("@jo", 3);
			expect(mention).toEqual({
				fullMatch: "@jo",
				username: "jo",
				startIndex: 0,
				endIndex: 3,
			});
		});

		it("should handle cursor at @ symbol", () => {
			const mention = getMentionAtCursor("@john", 1);
			expect(mention).toEqual({
				fullMatch: "@john",
				username: "john",
				startIndex: 0,
				endIndex: 5,
			});
		});
	});

	describe("replaceMentionAtCursor", () => {
		it("should replace mention with new username", () => {
			const result = replaceMentionAtCursor("@jo", 3, "john");
			expect(result.newText).toBe("@john ");
			expect(result.newCursorPosition).toBe(6); // After "@john "
		});

		it("should replace partial mention", () => {
			const result = replaceMentionAtCursor("Hello @ali", 10, "alice");
			expect(result.newText).toBe("Hello @alice ");
			expect(result.newCursorPosition).toBe(13);
		});

		it("should preserve text before and after mention", () => {
			const result = replaceMentionAtCursor(
				"Hello @jo world",
				9,
				"john"
			);
			expect(result.newText).toBe("Hello @john  world");
		});

		it("should return unchanged text when no mention at cursor", () => {
			const result = replaceMentionAtCursor("Hello world", 5, "john");
			expect(result.newText).toBe("Hello world");
			expect(result.newCursorPosition).toBe(5);
		});

		it("should handle mention at start of text", () => {
			const result = replaceMentionAtCursor("@alice", 6, "alice123");
			expect(result.newText).toBe("@alice123 ");
			expect(result.newCursorPosition).toBe(10);
		});

		it("should handle mention at end of text", () => {
			const result = replaceMentionAtCursor(
				"Message to @bo",
				14,
				"bob"
			);
			expect(result.newText).toBe("Message to @bob ");
			expect(result.newCursorPosition).toBe(16);
		});
	});
});
