import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    createChannelThreadReply,
    createThreadReply,
    listConversationPins,
    listPins,
    listThreadMessages,
    pinDMMessage,
    pinMessage,
    unpinChannelMessage,
    unpinMessage,
} from "@/lib/thread-pin-client";

describe("thread-pin-client", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("lists channel thread messages through the shared thread endpoint builder", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue({
            json: async () => ({ items: [{ $id: "reply-1" }] }),
            ok: true,
        } as Response);

        await expect(
            listThreadMessages<{ $id: string }>("channel", "message-1", 25),
        ).resolves.toEqual([{ $id: "reply-1" }]);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/messages/message-1/thread?limit=25",
        );
    });

    it("accepts legacy thread response keys during route normalization", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                json: async () => ({ replies: [{ $id: "reply-legacy" }] }),
                ok: true,
            } as Response)
            .mockResolvedValueOnce({
                json: async () => ({ reply: { $id: "reply-legacy-post" } }),
                ok: true,
            } as Response);

        await expect(
            listThreadMessages<{ $id: string }>("channel", "message-legacy"),
        ).resolves.toEqual([{ $id: "reply-legacy" }]);
        await expect(
            createThreadReply<{ $id: string }>("channel", "message-legacy", {
                text: "legacy",
            }),
        ).resolves.toEqual({ $id: "reply-legacy-post" });
    });

    it("creates DM thread replies through the shared thread endpoint builder", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue({
            json: async () => ({ message: { $id: "reply-2" } }),
            ok: true,
        } as Response);

        await expect(
            createThreadReply<{ $id: string }>("dm", "message-2", {
                text: "hello",
            }),
        ).resolves.toEqual({ $id: "reply-2" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/direct-messages/message-2/thread",
            expect.objectContaining({
                body: JSON.stringify({ text: "hello" }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            }),
        );
    });

    it("lists conversation pins through the shared pins endpoint builder", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValue({
            json: async () => ({
                items: [{ message: { $id: "dm-1" }, pin: { $id: "pin-1" } }],
            }),
            ok: true,
        } as Response);

        await expect(
            listPins<{ $id: string }>("dm", "conversation-1"),
        ).resolves.toEqual([
            { message: { $id: "dm-1" }, pin: { $id: "pin-1" } },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/conversations/conversation-1/pins",
        );
    });

    it("pins and unpins messages through the shared pin helpers", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                json: async () => ({ pin: { $id: "pin-1" } }),
                ok: true,
            } as Response)
            .mockResolvedValueOnce({
                json: async () => ({ success: true }),
                ok: true,
            } as Response);

        await expect(pinMessage("dm", "message-3")).resolves.toEqual({
            $id: "pin-1",
        });
        await expect(unpinMessage("channel", "message-4")).resolves.toBe(
            undefined,
        );

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/direct-messages/message-3/pin",
            { method: "POST" },
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/messages/message-4/pin",
            { method: "DELETE" },
        );
    });

    it("keeps the specialized wrapper exports aligned with the shared helpers", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                json: async () => ({ message: { $id: "reply-3" } }),
                ok: true,
            } as Response)
            .mockResolvedValueOnce({
                json: async () => ({
                    items: [
                        { message: { $id: "dm-2" }, pin: { $id: "pin-2" } },
                    ],
                }),
                ok: true,
            } as Response)
            .mockResolvedValueOnce({
                json: async () => ({ pin: { $id: "pin-3" } }),
                ok: true,
            } as Response)
            .mockResolvedValueOnce({
                json: async () => ({ success: true }),
                ok: true,
            } as Response);

        await expect(
            createChannelThreadReply("message-5", { text: "reply" }),
        ).resolves.toEqual({ $id: "reply-3" });
        await expect(listConversationPins("conversation-2")).resolves.toEqual([
            { message: { $id: "dm-2" }, pin: { $id: "pin-2" } },
        ]);
        await expect(pinDMMessage("message-6")).resolves.toEqual({
            $id: "pin-3",
        });
        await expect(unpinChannelMessage("message-7")).resolves.toBe(undefined);

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/messages/message-5/thread",
            expect.objectContaining({ method: "POST" }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/conversations/conversation-2/pins",
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            "/api/direct-messages/message-6/pin",
            { method: "POST" },
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            "/api/messages/message-7/pin",
            { method: "DELETE" },
        );
    });
});
