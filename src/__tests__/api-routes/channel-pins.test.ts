import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetServerSession, mockGetDocument, mockListDocuments } = vi.hoisted(
    () => ({
        mockGetServerSession: vi.fn(),
        mockGetDocument: vi.fn(),
        mockListDocuments: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            channels: "channels",
            messages: "messages",
            pinnedMessages: "pinned_messages",
        },
    })),
}));

vi.mock("@/lib/newrelic-utils", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    recordError: vi.fn(),
    setTransactionName: vi.fn(),
    trackApiCall: vi.fn(),
    addTransactionAttributes: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join(",") : value})`,
        limit: (value: number) => `limit(${value})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
    },
}));

describe("Channel Pins API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const { GET } =
            await import("../../app/api/channels/[channelId]/pins/route");
        const request = new NextRequest(
            "http://localhost/api/channels/channel-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ channelId: "channel-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns both items and legacy pins shape", async () => {
        const now = new Date().toISOString();

        mockGetServerSession.mockResolvedValue({ $id: "user-1" });
        mockGetDocument.mockResolvedValue({ $id: "channel-1" });

        mockListDocuments
            .mockResolvedValueOnce({
                total: 1,
                documents: [
                    {
                        $id: "pin-1",
                        messageId: "msg-1",
                        contextType: "channel",
                        contextId: "channel-1",
                        pinnedBy: "user-1",
                        pinnedAt: now,
                    },
                ],
            })
            .mockResolvedValueOnce({
                total: 1,
                documents: [
                    {
                        $id: "msg-1",
                        userId: "user-1",
                        text: "Pinned hello",
                        channelId: "channel-1",
                        $createdAt: now,
                    },
                ],
            });

        const { GET } =
            await import("../../app/api/channels/[channelId]/pins/route");
        const request = new NextRequest(
            "http://localhost/api/channels/channel-1/pins",
            {
                method: "GET",
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ channelId: "channel-1" }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.items).toHaveLength(1);
        expect(data.items[0].pin.messageId).toBe("msg-1");
        expect(data.items[0].message.isPinned).toBe(true);
        expect(data.pins).toHaveLength(1);
        expect(data.pins[0].$id).toBe("msg-1");
    });
});
