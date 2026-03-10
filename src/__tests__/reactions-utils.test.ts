import { describe, it, expect } from "vitest";
import {
    parseReactions,
    parseReactionsWithMetadata,
} from "@/lib/reactions-utils";
import type { Reaction } from "@/lib/reactions-utils";

describe("Reactions Utils", () => {
    describe("parseReactions", () => {
        it("should return empty array for undefined input", () => {
            const result = parseReactions(undefined);
            expect(result).toEqual([]);
        });

        it("should return empty array for null input", () => {
            const result = parseReactions(null as unknown as undefined);
            expect(result).toEqual([]);
        });

        it("should parse valid JSON string", () => {
            const reactions: Reaction[] = [
                { emoji: "👍", userIds: ["user1", "user2"], count: 2 },
                { emoji: "❤️", userIds: ["user3"], count: 1 },
            ];
            const jsonString = JSON.stringify(reactions);

            const result = parseReactions(jsonString);

            expect(result).toHaveLength(2);
            expect(result[0].emoji).toBe("👍");
            expect(result[0].count).toBe(2);
            expect(result[1].emoji).toBe("❤️");
        });

        it("should handle empty JSON array string", () => {
            const result = parseReactions("[]");
            expect(result).toEqual([]);
        });

        it("should return empty array for invalid JSON string", () => {
            const result = parseReactions("invalid json");
            expect(result).toEqual([]);
        });

        it("should return empty array for non-array JSON", () => {
            const result = parseReactions('{"not": "array"}');
            expect(result).toEqual([]);
        });

        it("should handle array input directly", () => {
            const reactions: Reaction[] = [
                { emoji: "🔥", userIds: ["user1"], count: 1 },
            ];

            const result = parseReactions(reactions);

            expect(result).toEqual(reactions);
            expect(result[0].emoji).toBe("🔥");
        });

        it("should handle empty array input", () => {
            const result = parseReactions([]);
            expect(result).toEqual([]);
        });

        it("should preserve all reaction properties", () => {
            const reactions: Reaction[] = [
                {
                    emoji: "🎉",
                    userIds: ["user1", "user2", "user3"],
                    count: 3,
                },
            ];

            const result = parseReactions(reactions);

            expect(result[0].emoji).toBe("🎉");
            expect(result[0].userIds).toEqual(["user1", "user2", "user3"]);
            expect(result[0].count).toBe(3);
        });

        it("should handle multiple reactions with same emoji", () => {
            const jsonString = JSON.stringify([
                { emoji: "👍", userIds: ["user1"], count: 1 },
                { emoji: "👍", userIds: ["user2"], count: 1 },
            ]);

            const result = parseReactions(jsonString);

            expect(result).toHaveLength(2);
            expect(result[0].emoji).toBe("👍");
            expect(result[1].emoji).toBe("👍");
        });

        it("should handle reactions with empty userIds arrays", () => {
            const reactions: Reaction[] = [
                { emoji: "😊", userIds: [], count: 0 },
            ];

            const result = parseReactions(reactions);

            expect(result[0].userIds).toEqual([]);
            expect(result[0].count).toBe(0);
        });

        it("should handle malformed but parseable JSON", () => {
            const jsonString = '[{"emoji":"😎","userIds":[],"count":0}]';

            const result = parseReactions(jsonString);

            expect(result).toHaveLength(1);
            expect(result[0].emoji).toBe("😎");
        });

        it("should return empty array for unexpected input types", () => {
            // Force test with invalid type to cover fallback case
            const result = parseReactions(42 as unknown as string);
            expect(result).toEqual([]);
        });

        it("should return empty array for object input", () => {
            // Force test with object to cover fallback case
            const result = parseReactions({
                not: "valid",
            } as unknown as Reaction[]);
            expect(result).toEqual([]);
        });

        it("should normalize legacy emoji-to-userIds maps", () => {
            const result = parseReactions({
                "🔥": ["user1", "user2"],
                "❤️": ["user3"],
            } as unknown as Reaction[]);

            expect(result).toEqual([
                { emoji: "🔥", userIds: ["user1", "user2"], count: 2 },
                { emoji: "❤️", userIds: ["user3"], count: 1 },
            ]);
        });

        it("should normalize legacy reaction objects with userIds", () => {
            const result = parseReactions({
                "🔥": { userIds: ["user1", "user2"], count: 99 },
            } as unknown as Reaction[]);

            expect(result).toEqual([
                { emoji: "🔥", userIds: ["user1", "user2"], count: 2 },
            ]);
        });

        it("should report when legacy data was normalized", () => {
            const result = parseReactionsWithMetadata(
                JSON.stringify({ "🔥": ["user1"] }),
            );

            expect(result.didNormalize).toBe(true);
            expect(result.reactions).toEqual([
                { emoji: "🔥", userIds: ["user1"], count: 1 },
            ]);
        });
    });
});
