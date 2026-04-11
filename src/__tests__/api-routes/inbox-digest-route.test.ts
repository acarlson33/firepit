import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/inbox/digest/route";

const { mockGetFeatureFlag, mockListInboxDigest, mockSession } = vi.hoisted(
    () => ({
        mockGetFeatureFlag: vi.fn(),
        mockListInboxDigest: vi.fn(),
        mockSession: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/inbox", () => ({
    listInboxDigest: mockListInboxDigest,
}));

vi.mock("@/lib/feature-flags", () => ({
    FEATURE_FLAGS: {
        ENABLE_INBOX_DIGEST: "enable_inbox_digest",
        ENABLE_INBOX_DIGEST_V1_5: "enable_inbox_digest_v1_5",
    },
    getFeatureFlag: mockGetFeatureFlag,
}));

describe("inbox digest route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetFeatureFlag.mockReset();
        mockListInboxDigest.mockReset();
        mockSession.mockReset();
        mockGetFeatureFlag.mockResolvedValue(true);
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 404 when digest flag is disabled", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetFeatureFlag.mockResolvedValueOnce(false);

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest"),
        );
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toContain("not enabled");
        expect(mockListInboxDigest).not.toHaveBeenCalled();
    });

    it("passes digest v1.5 mode when enabled", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetFeatureFlag
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true);
        mockListInboxDigest.mockResolvedValue({
            contractVersion: "thread_v1",
            contextId: undefined,
            contextKind: undefined,
            items: [],
            totalUnreadCount: 0,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest"),
        );

        expect(response.status).toBe(200);
        expect(mockListInboxDigest).toHaveBeenCalledWith({
            contextId: undefined,
            contextKind: undefined,
            limit: 50,
            useDigestV15: true,
            userId: "user-1",
        });
    });

    it("passes digest v1 mode when v1.5 flag is disabled", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetFeatureFlag
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        mockListInboxDigest.mockResolvedValue({
            contractVersion: "thread_v1",
            contextId: undefined,
            contextKind: undefined,
            items: [],
            totalUnreadCount: 0,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest"),
        );

        expect(response.status).toBe(200);
        expect(mockListInboxDigest).toHaveBeenCalledWith({
            contextId: undefined,
            contextKind: undefined,
            limit: 50,
            useDigestV15: false,
            userId: "user-1",
        });
    });

    it.each([
        {
            digestEnabled: false,
            digestV15Enabled: false,
            expectStatus: 404,
            expectCalled: false,
            expectUseDigestV15: undefined,
        },
        {
            digestEnabled: false,
            digestV15Enabled: true,
            expectStatus: 404,
            expectCalled: false,
            expectUseDigestV15: undefined,
        },
        {
            digestEnabled: true,
            digestV15Enabled: false,
            expectStatus: 200,
            expectCalled: true,
            expectUseDigestV15: false,
        },
        {
            digestEnabled: true,
            digestV15Enabled: true,
            expectStatus: 200,
            expectCalled: true,
            expectUseDigestV15: true,
        },
    ])(
        "applies digest gate matrix: digest=$digestEnabled v1_5=$digestV15Enabled",
        async ({
            digestEnabled,
            digestV15Enabled,
            expectCalled,
            expectStatus,
            expectUseDigestV15,
        }) => {
            mockSession.mockResolvedValue({ $id: "user-1" });
            if (!digestEnabled) {
                mockGetFeatureFlag.mockResolvedValueOnce(false);
            } else {
                mockGetFeatureFlag
                    .mockResolvedValueOnce(true)
                    .mockResolvedValueOnce(digestV15Enabled);
            }
            mockListInboxDigest.mockResolvedValue({
                contractVersion: "thread_v1",
                contextId: undefined,
                contextKind: undefined,
                items: [],
                totalUnreadCount: 0,
            });

            const response = await GET(
                new NextRequest("http://localhost/api/inbox/digest"),
            );

            expect(response.status).toBe(expectStatus);

            if (!expectCalled) {
                expect(mockListInboxDigest).not.toHaveBeenCalled();
                return;
            }

            expect(mockListInboxDigest).toHaveBeenCalledWith({
                contextId: undefined,
                contextKind: undefined,
                limit: 50,
                useDigestV15: expectUseDigestV15,
                userId: "user-1",
            });
        },
    );

    it("rejects invalid limit", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest?limit=0"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("limit");
        expect(mockListInboxDigest).not.toHaveBeenCalled();
    });

    it("rejects invalid context kind", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox/digest?contextKind=invalid&contextId=ctx-1",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("contextKind");
    });

    it("requires contextId and contextKind together", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox/digest?contextKind=conversation",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("provided together");
    });

    it("returns digest payload", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetFeatureFlag
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true);
        mockListInboxDigest.mockResolvedValue({
            contractVersion: "message_v2",
            contextId: "conversation-1",
            contextKind: "conversation",
            items: [
                {
                    activityAt: "2026-03-12T10:00:00.000Z",
                    authorLabel: "User Two",
                    authorUserId: "user-2",
                    contextId: "conversation-1",
                    contextKind: "conversation",
                    id: "thread:conversation:conversation-1:message-1",
                    kind: "thread",
                    messageId: "message-1",
                    muted: false,
                    previewText: "Unread thread reply",
                    unreadCount: 2,
                },
            ],
            totalUnreadCount: 2,
        });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox/digest?contextKind=conversation&contextId=conversation-1&limit=25",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxDigest).toHaveBeenCalledWith({
            contextId: "conversation-1",
            contextKind: "conversation",
            limit: 25,
            useDigestV15: true,
            userId: "user-1",
        });
        expect(data.totalUnreadCount).toBe(2);
    });

    it("returns 500 when digest lookup fails", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxDigest.mockRejectedValue(new Error("db unavailable"));

        const response = await GET(
            new NextRequest("http://localhost/api/inbox/digest"),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to load inbox digest");
    });
});
