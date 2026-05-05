import { describe, expect, it } from "vitest";

import {
    buildMessagePoll,
    isPollCommand,
    parsePollCommand,
    parsePollOptions,
} from "../lib/polls";

describe("poll helpers", () => {
    it("parses valid poll slash command", () => {
        const parsed = parsePollCommand(
            '/poll "Lunch plans?" | "Pizza" | "Tacos"',
        );

        expect(parsed.question).toBe("Lunch plans?");
        expect(parsed.options).toHaveLength(2);
        expect(parsed.options[0]).toEqual({ id: "option-1", text: "Pizza" });
        expect(parsed.options[1]).toEqual({ id: "option-2", text: "Tacos" });
    });

    it("rejects malformed poll slash command", () => {
        expect(() => parsePollCommand('/poll Lunch | "A" | "B"')).toThrow(
            "Invalid poll format",
        );
    });

    it("builds poll state with vote counts and voter ids", () => {
        const poll = buildMessagePoll({
            poll: {
                $id: "poll-1",
                messageId: "message-1",
                channelId: "channel-1",
                question: "Best pet?",
                options: JSON.stringify([
                    { id: "option-1", text: "Cat" },
                    { id: "option-2", text: "Dog" },
                ]),
                status: "open",
                createdBy: "user-1",
            },
            votes: [
                {
                    pollId: "poll-1",
                    userId: "user-1",
                    optionId: "option-2",
                },
                {
                    pollId: "poll-1",
                    userId: "user-2",
                    optionId: "option-2",
                },
            ],
        });

        expect(poll.options[0].count).toBe(0);
        expect(poll.options[1].count).toBe(2);
        expect(poll.options[1].voterIds).toEqual(["user-1", "user-2"]);
        expect(poll.contextType).toBe("channel");
        expect(poll.contextId).toBe("channel-1");
    });

    it("detects poll command boundaries correctly", () => {
        expect(isPollCommand('/poll "Question" | "A" | "B"')).toBe(true);
        expect(isPollCommand("   /poll")).toBe(true);
        expect(isPollCommand("/pollsomething")).toBe(false);
    });

    it("returns empty options for invalid serialized payload", () => {
        const options = parsePollOptions("not-json");
        expect(options).toEqual([]);
    });

    it("parses options from serialized string arrays", () => {
        const options = parsePollOptions(JSON.stringify(["Alpha", "Beta"]));

        expect(options).toEqual([
            { id: "option-1", text: "Alpha" },
            { id: "option-2", text: "Beta" },
        ]);
    });
});
