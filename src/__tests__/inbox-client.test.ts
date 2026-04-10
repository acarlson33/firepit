/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listInboxDigest, markInboxScopeRead } from "@/lib/inbox-client";

describe("inbox-client", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe("listInboxDigest", () => {
        it("requests inbox digest with scoped query parameters", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () =>
                        ({
                            json: async () => ({
                                contractVersion: "message_v2",
                                contextId: "conversation-1",
                                contextKind: "conversation",
                                items: [],
                                totalUnreadCount: 0,
                            }),
                            ok: true,
                        }) as Response,
                ),
            );

            const result = await listInboxDigest({
                contextId: "conversation-1",
                contextKind: "conversation",
                limit: 25,
            });

            expect(fetch).toHaveBeenCalledWith(
                "/api/inbox/digest?contextId=conversation-1&contextKind=conversation&limit=25",
            );
            expect(result.contractVersion).toBe("message_v2");
        });

        it("throws with server-provided message when digest request fails", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () =>
                        ({
                            json: async () => ({
                                error: "Inbox digest unavailable",
                            }),
                            ok: false,
                        }) as Response,
                ),
            );

            await expect(listInboxDigest()).rejects.toThrow(
                "Inbox digest unavailable",
            );
        });
    });

    describe("markInboxScopeRead", () => {
        it("marks all inbox items as read", async () => {
            const fetchMock = vi.fn(
                async () =>
                    ({
                        ok: true,
                    }) as Response,
            );
            vi.stubGlobal("fetch", fetchMock);

            await markInboxScopeRead("all");

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/inbox",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({
                        action: "mark-all-read",
                        contextKind: "channel",
                    }),
                }),
            );
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/inbox",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({
                        action: "mark-all-read",
                        contextKind: "conversation",
                    }),
                }),
            );
        });

        it("marks only direct messages as read when scope is direct", async () => {
            const fetchMock = vi.fn(
                async () =>
                    ({
                        ok: true,
                    }) as Response,
            );
            vi.stubGlobal("fetch", fetchMock);

            await markInboxScopeRead("direct");

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/inbox",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({
                        action: "mark-all-read",
                        contextKind: "conversation",
                    }),
                }),
            );
        });

        it("marks only server channels as read when scope is server", async () => {
            const fetchMock = vi.fn(
                async () =>
                    ({
                        ok: true,
                    }) as Response,
            );
            vi.stubGlobal("fetch", fetchMock);

            await markInboxScopeRead("server");

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/inbox",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({
                        action: "mark-all-read",
                        contextKind: "channel",
                    }),
                }),
            );
        });

        it("rejects when mark scope read request fails", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () =>
                        ({
                            json: async () => ({
                                error: "Inbox mark read unavailable",
                            }),
                            ok: false,
                        }) as Response,
                ),
            );

            await expect(markInboxScopeRead("all")).rejects.toThrow(
                "Inbox mark read unavailable",
            );
        });
    });
});
