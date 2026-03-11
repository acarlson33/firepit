import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PATCH } from "@/app/api/inbox/route";

const {
    mockListDocuments,
    mockListInboxItems,
    mockSession,
    mockUpdateDocument,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockListInboxItems: vi.fn(),
    mockSession: vi.fn(),
    mockUpdateDocument: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/appwrite-admin", () => ({
    getAdminClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        collections: {
            inboxItems: "inbox-items-collection",
        },
        databaseId: "test-db",
    })),
}));

vi.mock("@/lib/inbox", () => ({
    listInboxItems: mockListInboxItems,
}));

describe("inbox route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/inbox"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("rejects invalid kinds", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?kind=invalid"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("kind");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("rejects invalid limits", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await GET(
            new NextRequest("http://localhost/api/inbox?limit=0"),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("limit");
        expect(mockListInboxItems).not.toHaveBeenCalled();
    });

    it("returns the normalized inbox payload", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListInboxItems.mockResolvedValue({
            counts: { mention: 1, thread: 0 },
            items: [
                {
                    authorAvatarUrl: "https://example.com/avatar.png",
                    authorLabel: "Alice",
                    authorUserId: "user-2",
                    contextId: "channel-1",
                    contextKind: "channel",
                    id: "mention:channel:channel-1:message-1",
                    kind: "mention",
                    latestActivityAt: "2026-03-11T12:00:00.000Z",
                    messageId: "message-1",
                    muted: false,
                    previewText: "Hello @user-1",
                    unreadCount: 1,
                },
            ],
            unreadCount: 1,
        });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/inbox?kind=mention,thread&limit=25",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListInboxItems).toHaveBeenCalledWith({
            kinds: ["mention", "thread"],
            limit: 25,
            userId: "user-1",
        });
        expect(data.items).toHaveLength(1);
        expect(data.counts.mention).toBe(1);
    });

    it("marks inbox items as read for the authenticated user", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "item-1" }, { $id: "item-2" }],
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({ itemIds: ["item-1", "item-2"] }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListDocuments).toHaveBeenCalled();
        expect(mockUpdateDocument).toHaveBeenCalledTimes(2);
        expect(data.ok).toBe(true);
    });

    it("rejects empty inbox read updates", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await PATCH(
            new NextRequest("http://localhost/api/inbox", {
                body: JSON.stringify({ itemIds: [] }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("itemIds");
        expect(mockUpdateDocument).not.toHaveBeenCalled();
    });
});
