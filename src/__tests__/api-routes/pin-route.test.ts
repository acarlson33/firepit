import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "../../app/api/messages/[messageId]/pin/route";
import type { Message } from "../../lib/types";

const {
  mockGetServerSession,
  mockGetDocument,
  mockUpdateDocument,
  mockListDocuments,
  mockRolesListDocuments,
  mockRolesGetDocument,
  mockGetEnvConfig,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetDocument: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockListDocuments: vi.fn(),
  mockRolesListDocuments: vi.fn(),
  mockRolesGetDocument: vi.fn(),
  mockGetEnvConfig: vi.fn(() => ({
    databaseId: "db",
    collections: { messages: "messages" },
  })),
}));

vi.mock("node-appwrite", () => {
  class MockDatabases {
    listDocuments = mockRolesListDocuments;
    getDocument = mockRolesGetDocument;
    updateDocument = vi.fn();
  }

  class MockClient {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  }

  return {
    Query: {
      equal: (...args: unknown[]) => ["equal", ...args],
      limit: (value: unknown) => ["limit", value],
      orderDesc: (value: unknown) => ["orderDesc", value],
    },
    Databases: MockDatabases,
    Client: MockClient,
  };
});

vi.mock("../../lib/auth-server", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("../../lib/appwrite-core", () => ({
  getEnvConfig: mockGetEnvConfig,
}));

vi.mock("../../lib/appwrite-server", () => ({
  getServerClient: () => ({
    databases: {
      getDocument: mockGetDocument,
      listDocuments: mockListDocuments,
      updateDocument: mockUpdateDocument,
    },
  }),
}));

vi.mock("../../lib/permissions", () => ({
  getEffectivePermissions: vi.fn(() => ({ manageMessages: true })),
  hasPermission: vi.fn((perm: string, perms: Record<string, boolean>) => Boolean(perms[perm])),
}));

vi.mock("../../lib/newrelic-utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordError: vi.fn(),
  setTransactionName: vi.fn(),
  trackApiCall: vi.fn(),
  addTransactionAttributes: vi.fn(),
}));

describe("Pin route", () => {
  const baseMessage: Message = {
    $id: "msg-1",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    channelId: "channel-1",
    serverId: "server-1",
    userId: "owner-1",
    userName: "Owner",
    text: "hello",
  } as Message;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ $id: "user-1", name: "Test" });
    mockGetEnvConfig.mockReturnValue({ databaseId: "db", collections: { messages: "messages" } });

    // Default roles queries: user has manageMessages
    mockRolesListDocuments.mockResolvedValue({ documents: [{ roleIds: ["role-1"] }] });
    mockRolesGetDocument.mockResolvedValue({ manageMessages: true });
  });

  it("POST rejects unauthenticated users", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/messages/msg-1/pin", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ messageId: "msg-1" }) });
    expect(response.status).toBe(401);
  });

  it("POST blocks when pin limit reached", async () => {
    mockGetDocument.mockResolvedValue(baseMessage);
    mockListDocuments.mockResolvedValue({ documents: Array.from({ length: 50 }, (_, i) => ({ $id: `pin-${i}` })) });

    const request = new NextRequest("http://localhost/api/messages/msg-1/pin", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ messageId: "msg-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Maximum 50 pinned messages per channel");
    expect(mockUpdateDocument).not.toHaveBeenCalled();
  });

  it("DELETE unpins message", async () => {
    mockGetDocument.mockResolvedValue({ ...baseMessage, isPinned: true });
    mockUpdateDocument.mockResolvedValue({ ...baseMessage, isPinned: false });

    const request = new NextRequest("http://localhost/api/messages/msg-1/pin", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ messageId: "msg-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message.isPinned).toBe(false);
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      "db",
      "messages",
      "msg-1",
      expect.objectContaining({ isPinned: false, pinnedAt: null, pinnedBy: null })
    );
  });
});
