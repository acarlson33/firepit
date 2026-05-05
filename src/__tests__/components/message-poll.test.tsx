/// <reference lib="dom" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessagePollBlock } from "@/components/message-poll";
import type { MessagePoll } from "@/lib/types";

const basePoll = {
    id: "poll-1",
    messageId: "message-1",
    contextType: "channel",
    contextId: "channel-1",
    question: "Pick one",
    options: [
        {
            id: "option-1",
            text: "Alpha",
            count: 0,
            voterIds: [],
        },
        {
            id: "option-2",
            text: "Beta",
            count: 0,
            voterIds: [],
        },
    ],
    status: "open",
    createdBy: "user-2",
} satisfies MessagePoll;

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("MessagePollBlock", () => {
    it("uses external onVote handler when provided", async () => {
        const user = userEvent.setup();
        const onVote = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        render(
            <MessagePollBlock
                currentUserId="user-1"
                messageId="message-1"
                onVote={onVote}
                poll={basePoll}
            />,
        );

        await user.click(screen.getByRole("button", { name: /alpha/i }));

        await waitFor(() => {
            expect(onVote).toHaveBeenCalledWith("option-1");
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses external onClose handler when provided", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        render(
            <MessagePollBlock
                canClose={true}
                currentUserId="user-1"
                messageId="message-1"
                onClose={onClose}
                poll={basePoll}
            />,
        );

        await user.click(screen.getByRole("button", { name: /close poll/i }));

        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
