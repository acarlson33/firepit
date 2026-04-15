import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockUpdateDocument,
    mockGetChannelAccessForUser,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: vi.fn((field: string, value: string) => `equal(${field},${value})`),
        limit: vi.fn((value: number) => `limit(${value})`),
    },
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            getDocument: mockGetDocument,
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages-collection",
            polls: "polls-collection",
            pollVotes: "poll-votes-collection",
        },
    })),
}));

describe("Message Poll Close API", () => {
    let POST: (request: NextRequest, context: unknown) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await import(
            "../../app/api/messages/[messageId]/poll/close/route"
        );
        POST = module.POST;

        mockGetChannelAccessForUser.mockResolvedValue({
            serverId: "server-1",
            isServerOwner: false,
            isMember: true,
            canRead: true,
            canSend: true,
        });
    });

    it("returns 403 when caller cannot close poll", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "User" });
        mockGetDocument.mockResolvedValue({ $id: "msg-1", channelId: "channel-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            permissions: { manageMessages: false, administrator: false },
        });

        mockListDocuments.mockResolvedValue({
            documents: [
                {
                    $id: "poll-1",
                    messageId: "msg-1",
                    channelId: "channel-1",
                    question: "Question",
                    options: JSON.stringify([{ id: "option-1", text: "A" }]),
                    status: "open",
                    createdBy: "user-2",
                },
            ],
        });

        const response = await POST(
            new NextRequest("http://localhost/api/messages/msg-1/poll/close", {
                method: "POST",
            }),
            { params: Promise.resolve({ messageId: "msg-1" }) },
        );

        expect(response.status).toBe(403);
    });

    it("closes poll when caller is creator", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "User" });
        mockGetDocument.mockResolvedValue({ $id: "msg-1", channelId: "channel-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            permissions: { manageMessages: false, administrator: false },
        });

        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "poll-1",
                        messageId: "msg-1",
                        channelId: "channel-1",
                        question: "Question",
                        options: JSON.stringify([
                            { id: "option-1", text: "A" },
                            { id: "option-2", text: "B" },
                        ]),
                        status: "open",
                        createdBy: "user-1",
                    },
                ],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "poll-1",
                        messageId: "msg-1",
                        channelId: "channel-1",
                        question: "Question",
                        options: JSON.stringify([
                            { id: "option-1", text: "A" },
                            { id: "option-2", text: "B" },
                        ]),
                        status: "closed",
                        createdBy: "user-1",
                        closedBy: "user-1",
                        closedAt: "2026-04-12T12:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] });

        mockUpdateDocument.mockResolvedValue({ $id: "poll-1" });

        const response = await POST(
            new NextRequest("http://localhost/api/messages/msg-1/poll/close", {
                method: "POST",
            }),
            { params: Promise.resolve({ messageId: "msg-1" }) },
        );

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
        expect(payload.poll.status).toBe("closed");
    });
});
