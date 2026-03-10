import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildChatMessageHref,
    jumpToMessage,
    jumpToMessageWhenReady,
} from "@/lib/message-navigation";

describe("message-navigation", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("builds a channel message href with server context", () => {
        expect(
            buildChatMessageHref({
                kind: "channel",
                channelId: "channel-1",
                messageId: "message-1",
                serverId: "server-1",
            }),
        ).toBe("/chat?channel=channel-1&server=server-1&highlight=message-1");
    });

    it("builds a dm message href", () => {
        expect(
            buildChatMessageHref({
                kind: "dm",
                conversationId: "conversation-1",
                messageId: "message-1",
            }),
        ).toBe("/chat?conversation=conversation-1&highlight=message-1");
    });

    it("jumps to a rendered message and removes the highlight classes later", () => {
        document.body.innerHTML = '<div data-message-id="message-1"></div>';
        const target = document.querySelector<HTMLElement>(
            '[data-message-id="message-1"]',
        );

        if (!target) {
            throw new Error("expected target element to exist");
        }

        const scrollIntoView = vi.fn();
        target.scrollIntoView = scrollIntoView;

        expect(jumpToMessage("message-1", { highlightDurationMs: 500 })).toBe(
            true,
        );
        expect(scrollIntoView).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "center",
        });
        expect(target.classList.contains("ring-2")).toBe(true);
        expect(target.classList.contains("ring-amber-400")).toBe(true);

        vi.advanceTimersByTime(500);

        expect(target.classList.contains("ring-2")).toBe(false);
        expect(target.classList.contains("ring-amber-400")).toBe(false);
    });

    it("retries until the target message is rendered", () => {
        const onComplete = vi.fn();
        const stopWaiting = jumpToMessageWhenReady("message-2", {
            retryAttempts: 3,
            retryDelayMs: 100,
            onComplete,
        });

        vi.advanceTimersByTime(100);
        document.body.innerHTML = '<div data-message-id="message-2"></div>';
        const target = document.querySelector<HTMLElement>(
            '[data-message-id="message-2"]',
        );

        if (!target) {
            throw new Error("expected target element to exist");
        }

        const scrollIntoView = vi.fn();
        target.scrollIntoView = scrollIntoView;

        vi.advanceTimersByTime(100);

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(onComplete).toHaveBeenCalledWith(true);

        stopWaiting();
    });
});
