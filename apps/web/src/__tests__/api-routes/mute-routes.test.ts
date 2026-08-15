import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postServerMute } from "../../app/api/servers/[serverId]/mute/route";
import { POST as postChannelMute } from "../../app/api/channels/[channelId]/mute/route";
import { POST as postConversationMute } from "../../app/api/conversations/[conversationId]/mute/route";

const {
  mockSession,
  mockMuteServer,
  mockUnmuteServer,
  mockMuteChannel,
  mockUnmuteChannel,
  mockMuteConversation,
  mockUnmuteConversation,
  mockGetServerPermissionsForUser,
  mockGetDocument,
} = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockMuteServer: vi.fn(),
  mockUnmuteServer: vi.fn(),
  mockMuteChannel: vi.fn(),
  mockUnmuteChannel: vi.fn(),
  mockMuteConversation: vi.fn(),
  mockUnmuteConversation: vi.fn(),
  mockGetServerPermissionsForUser: vi.fn(),
  mockGetDocument: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockSession }));

vi.mock("@/lib/server-channel-access", () => ({
  getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-server", () => ({
  getServerClient: vi.fn(() => ({
    databases: { getDocument: mockGetDocument },
  })),
}));

vi.mock("@/lib/appwrite-core", () => ({
  getEnvConfig: vi.fn(() => ({
    databaseId: "test-db",
    collections: {
      channels: "channels-collection",
      conversations: "conversations-collection",
    },
  })),
}));

vi.mock("@/lib/notification-settings", () => ({
  muteServer: mockMuteServer,
  unmuteServer: mockUnmuteServer,
  muteChannel: mockMuteChannel,
  unmuteChannel: mockUnmuteChannel,
  muteConversation: mockMuteConversation,
  unmuteConversation: mockUnmuteConversation,
  isMuteExpired: (mutedUntil?: string) =>
    mutedUntil ? Date.parse(mutedUntil) <= Date.now() : false,
}));

describe("Mute routes", () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockMuteServer.mockReset();
    mockUnmuteServer.mockReset();
    mockMuteChannel.mockReset();
    mockUnmuteChannel.mockReset();
    mockMuteConversation.mockReset();
    mockUnmuteConversation.mockReset();
    mockGetServerPermissionsForUser.mockReset();
    mockGetServerPermissionsForUser.mockResolvedValue({
      isMember: true,
      isServerOwner: false,
      permissions: {},
    });
    mockGetDocument.mockReset();
  });

  it("returns 401 when unauthenticated for server mute", async () => {
    mockSession.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/servers/server-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: true }),
    });

    const response = await postServerMute(request, {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("returns 403 when not a member of the server", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetServerPermissionsForUser.mockResolvedValue({
      isMember: false,
      isServerOwner: false,
      permissions: {},
    });

    const request = new NextRequest("http://localhost/api/servers/server-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: true }),
    });

    const response = await postServerMute(request, {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(403);
    expect(mockMuteServer).not.toHaveBeenCalled();
  });

  it("validates duration for server mute", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });

    const request = new NextRequest("http://localhost/api/servers/server-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: true, duration: "2h" }),
    });

    const response = await postServerMute(request, {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid duration");
    expect(mockMuteServer).not.toHaveBeenCalled();
  });

  it("mutes a server when payload is valid", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockMuteServer.mockResolvedValue({
      serverOverrides: {
        "server-1": {
          mutedUntil: new Date(Date.now() + 3600000).toISOString(),
          level: "mentions",
        },
      },
    });

    const request = new NextRequest("http://localhost/api/servers/server-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: true, duration: "1h", level: "mentions" }),
    });

    const response = await postServerMute(request, {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mockMuteServer).toHaveBeenCalledWith("user-1", "server-1", "1h", "mentions");
    expect(data.muted).toBe(true);
    expect(data.level).toBe("mentions");
  });

  it("unmutes a server when muted is false", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockUnmuteServer.mockResolvedValue({ serverOverrides: {} });

    const request = new NextRequest("http://localhost/api/servers/server-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: false }),
    });

    const response = await postServerMute(request, {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mockUnmuteServer).toHaveBeenCalledWith("user-1", "server-1");
    expect(data.muted).toBe(false);
  });

  it("mutes a channel", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetDocument.mockResolvedValue({
      $id: "channel-1",
      serverId: "server-1",
    });
    mockMuteChannel.mockResolvedValue({
      channelOverrides: { "channel-1": { mutedUntil: "soon", level: "nothing" } },
    });

    const request = new NextRequest("http://localhost/api/channels/channel-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: true, duration: "forever", level: "nothing" }),
    });

    const response = await postChannelMute(request, {
      params: Promise.resolve({ channelId: "channel-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mockMuteChannel).toHaveBeenCalledWith("user-1", "channel-1", "forever", "nothing");
    expect(data.mutedUntil).toBe("soon");
  });

  it("unmutes a conversation", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetDocument.mockResolvedValue({
      $id: "convo-1",
      participants: ["user-1", "user-2"],
    });
    mockUnmuteConversation.mockResolvedValue({ conversationOverrides: {} });

    const request = new NextRequest("http://localhost/api/conversations/convo-1/mute", {
      method: "POST",
      body: JSON.stringify({ muted: false }),
    });

    const response = await postConversationMute(request, {
      params: Promise.resolve({ conversationId: "convo-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mockUnmuteConversation).toHaveBeenCalledWith("user-1", "convo-1");
    expect(data.muted).toBe(false);
  });
});
