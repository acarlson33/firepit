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

    it("builds an unread-entry href when requested", () => {
        expect(
            buildChatMessageHref(
                {
                    kind: "channel",
                    channelId: "channel-1",
                    messageId: "message-2",
                    serverId: "server-1",
                },
                { entry: "unread" },
            ),
        ).toBe("/chat?channel=channel-1&server=server-1&unread=message-2");
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

    it("scrolls the nearest message container instead of the page viewport", () => {
        document.body.innerHTML =
            '<div data-scroll-container style="overflow-y: auto;"><div data-message-id="message-1"></div></div>';

        const container = document.querySelector<HTMLElement>(
            "[data-scroll-container]",
        );
        const target = document.querySelector<HTMLElement>(
            '[data-message-id="message-1"]',
        );

        if (!container || !target) {
            throw new Error("expected container and target elements to exist");
        }

        Object.defineProperty(container, "clientHeight", {
            configurable: true,
            value: 400,
        });
        Object.defineProperty(container, "scrollHeight", {
            configurable: true,
            value: 1200,
        });
        Object.defineProperty(container, "scrollTop", {
            configurable: true,
            value: 100,
            writable: true,
        });
        Object.defineProperty(target, "clientHeight", {
            configurable: true,
            value: 60,
        });

        container.getBoundingClientRect = vi.fn(() => ({
            bottom: 400,
            height: 400,
            left: 0,
            right: 300,
            top: 0,
            width: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }));
        target.getBoundingClientRect = vi.fn(() => ({
            bottom: 560,
            height: 60,
            left: 0,
            right: 300,
            top: 500,
            width: 300,
            x: 0,
            y: 500,
            toJSON: () => ({}),
        }));

        const scrollTo = vi.fn();
        container.scrollTo = scrollTo;

        const scrollIntoView = vi.fn();
        target.scrollIntoView = scrollIntoView;

        expect(jumpToMessage("message-1", { highlightDurationMs: 500 })).toBe(
            true,
        );

        expect(scrollTo).toHaveBeenCalledWith({
            behavior: "smooth",
            top: 430,
        });
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("prefers the marked message container even before overflow is measurable", () => {
        document.body.innerHTML =
            '<div data-message-scroll-container="true"><div data-message-id="message-1"></div></div>';

        const container = document.querySelector<HTMLElement>(
            "[data-message-scroll-container]",
        );
        const target = document.querySelector<HTMLElement>(
            '[data-message-id="message-1"]',
        );

        if (!container || !target) {
            throw new Error("expected container and target elements to exist");
        }

        Object.defineProperty(container, "clientHeight", {
            configurable: true,
            value: 400,
        });
        Object.defineProperty(container, "scrollHeight", {
            configurable: true,
            value: 400,
        });
        Object.defineProperty(container, "scrollTop", {
            configurable: true,
            value: 0,
            writable: true,
        });
        Object.defineProperty(target, "clientHeight", {
            configurable: true,
            value: 60,
        });

        container.getBoundingClientRect = vi.fn(() => ({
            bottom: 400,
            height: 400,
            left: 0,
            right: 300,
            top: 0,
            width: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }));
        target.getBoundingClientRect = vi.fn(() => ({
            bottom: 120,
            height: 60,
            left: 0,
            right: 300,
            top: 60,
            width: 300,
            x: 0,
            y: 60,
            toJSON: () => ({}),
        }));

        const scrollTo = vi.fn();
        container.scrollTo = scrollTo;

        const scrollIntoView = vi.fn();
        target.scrollIntoView = scrollIntoView;

        expect(jumpToMessage("message-1", { highlightDurationMs: 500 })).toBe(
            true,
        );

        expect(scrollTo).toHaveBeenCalledWith({
            behavior: "smooth",
            top: 0,
        });
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("retries until the target message is rendered", () => {
        const onComplete = vi.fn();
        const onRetry = vi.fn();
        const stopWaiting = jumpToMessageWhenReady("message-2", {
            retryAttempts: 3,
            retryDelayMs: 100,
            onComplete,
            onRetry,
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
        expect(onRetry).toHaveBeenCalledWith(1);

        stopWaiting();
    });
});
