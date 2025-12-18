import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../../app/api/messages/[messageId]/thread/route";
import type { Message } from "../../lib/types";

// Hoisted mocks
const {
  mockGetServerSession,
  mockGetDocument,
  mockListDocuments,
  mockCreateDocument,
  mockUpdateDocument,
  mockGetEnvConfig,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetDocument: vi.fn(),
  mockListDocuments: vi.fn(),
  mockCreateDocument: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockGetEnvConfig: vi.fn(() => ({
    databaseId: "db",
    collections: { messages: "messages" },
    teams: { moderatorTeamId: "mod-team", adminTeamId: "admin-team" },
  })),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: (...args: unknown[]) => ["equal", ...args],
    orderAsc: (value: unknown) => ["orderAsc", value],
    limit: (value: unknown) => ["limit", value],
    cursorAfter: (value: unknown) => ["cursorAfter", value],
  },
  ID: { unique: () => "new-id" },
}));

vi.mock("@/lib/auth-server", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
  getServerClient: () => ({
    databases: {
      getDocument: mockGetDocument,
      listDocuments: mockListDocuments,
      createDocument: mockCreateDocument,
      updateDocument: mockUpdateDocument,
    },
  }),
}));

vi.mock("@/lib/appwrite-core", () => ({
  getEnvConfig: mockGetEnvConfig,
  perms: { message: vi.fn(() => []) },
}));

vi.mock("@/lib/newrelic-utils", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  recordError: vi.fn(),
  setTransactionName: vi.fn(),
  trackApiCall: vi.fn(),
  addTransactionAttributes: vi.fn(),
}));

describe("Thread route", () => {
  const parentMessage: Message = {
    $id: "parent-1",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    channelId: "channel-1",
    serverId: "server-1",
    text: "Parent",
    userId: "u1",
    userName: "Parent User",
  } as Message;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "Test" });
    mockGetEnvConfig.mockReturnValue({
      databaseId: "db",
      collections: { messages: "messages" },
      teams: { moderatorTeamId: "mod-team", adminTeamId: "admin-team" },
    });
  });

  it("GET requires authentication", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/messages/parent-1/thread");
    const response = await GET(request, { params: Promise.resolve({ messageId: "parent-1" }) });

    expect(response.status).toBe(401);
  });

  it("GET returns parent and replies", async () => {
    mockGetDocument.mockResolvedValue(parentMessage);
    mockListDocuments.mockResolvedValue({ documents: [{ $id: "r1" }], total: 1 });

    const request = new NextRequest("http://localhost/api/messages/parent-1/thread");
    const response = await GET(request, { params: Promise.resolve({ messageId: "parent-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.parentMessage.$id).toBe("parent-1");
    expect(data.replies).toHaveLength(1);
    expect(mockListDocuments).toHaveBeenCalled();
  });

  it("POST creates reply and updates parent metadata", async () => {
    mockGetDocument.mockResolvedValue(parentMessage);
    mockCreateDocument.mockResolvedValue({ $id: "reply-1", threadId: "parent-1" });

    const request = new NextRequest("http://localhost/api/messages/parent-1/thread", {
      method: "POST",
      body: JSON.stringify({ text: "child" }),
    });

    const response = await POST(request, { params: Promise.resolve({ messageId: "parent-1" }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.reply.$id).toBe("reply-1");

    // Ensure thread metadata was updated on parent
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      "db",
      "messages",
      "parent-1",
      expect.objectContaining({
        threadReplyCount: expect.any(Number),
        lastThreadReplyAt: expect.any(String),
      })
    );

    // Ensure reply was created with threadId
    const call = mockCreateDocument.mock.calls[0];
    expect(call[0]).toBe("db");
    expect(call[1]).toBe("messages");
    expect(call[3]).toMatchObject({ threadId: "parent-1" });
  });
});
