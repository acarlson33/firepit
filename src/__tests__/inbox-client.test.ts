/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listInboxDigest } from "@/lib/inbox-client";

describe("inbox-client", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

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
