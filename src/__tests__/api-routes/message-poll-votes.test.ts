import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockGetServerSession,
    mockGetDocument,
    mockListDocuments,
    mockCreateDocument,
    mockUpdateDocument,
    mockGetChannelAccessForUser,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockGetDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockCreateDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockGetChannelAccessForUser: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    ID: { unique: () => "vote-id" },
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
            createDocument: mockCreateDocument,
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/server-channel-access", () => ({
    getChannelAccessForUser: mockGetChannelAccessForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            messages: "messages-collection",
            polls: "polls-collection",
            pollVotes: "poll-votes-collection",
        },
        teams: {
            moderatorTeamId: "mod-team",
            adminTeamId: "admin-team",
        },
    })),
    perms: {
        message: vi.fn(() => ["read(any)", "write(user:user-1)"]),
    },
}));

describe("Message Poll Votes API", () => {
    let POST: (request: NextRequest, context: unknown) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await import(
            "../../app/api/messages/[messageId]/poll-votes/route"
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

    it("returns 401 for unauthenticated users", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await POST(
            new NextRequest("http://localhost/api/messages/msg-1/poll-votes", {
                method: "POST",
                body: JSON.stringify({ optionId: "option-1" }),
            }),
            { params: Promise.resolve({ messageId: "msg-1" }) },
        );

        expect(response.status).toBe(401);
    });

    it("returns 400 when optionId is missing", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "User" });

        const response = await POST(
            new NextRequest("http://localhost/api/messages/msg-1/poll-votes", {
                method: "POST",
                body: JSON.stringify({}),
            }),
            { params: Promise.resolve({ messageId: "msg-1" }) },
        );

        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain("optionId");
    });

    it("creates a vote and returns updated poll", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "User" });
        mockGetDocument.mockResolvedValue({
            $id: "msg-1",
            channelId: "channel-1",
        });

        mockListDocuments
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "poll-1",
                        messageId: "msg-1",
                        channelId: "channel-1",
                        question: "Best food?",
                        options: JSON.stringify([
                            { id: "option-1", text: "Pizza" },
                            { id: "option-2", text: "Tacos" },
                        ]),
                        status: "open",
                        createdBy: "user-2",
                    },
                ],
            })
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "poll-1",
                        messageId: "msg-1",
                        channelId: "channel-1",
                        question: "Best food?",
                        options: JSON.stringify([
                            { id: "option-1", text: "Pizza" },
                            { id: "option-2", text: "Tacos" },
                        ]),
                        status: "open",
                        createdBy: "user-2",
                    },
                ],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "vote-1",
                        pollId: "poll-1",
                        userId: "user-1",
                        optionId: "option-1",
                    },
                ],
            });

        mockCreateDocument.mockResolvedValue({ $id: "vote-1" });

        const response = await POST(
            new NextRequest("http://localhost/api/messages/msg-1/poll-votes", {
                method: "POST",
                body: JSON.stringify({ optionId: "option-1" }),
            }),
            { params: Promise.resolve({ messageId: "msg-1" }) },
        );

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.poll).toBeDefined();
        expect(payload.poll.options[0].count).toBe(1);
        expect(payload.poll.options[0].voterIds).toEqual(["user-1"]);
    });
});
