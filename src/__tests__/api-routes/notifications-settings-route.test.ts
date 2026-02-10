import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../../app/api/notifications/settings/route";

const { mockSession, mockGetOrCreate, mockUpdate } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockGetOrCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  getServerSession: mockSession,
}));

vi.mock("@/lib/notification-settings", () => ({
  getOrCreateNotificationSettings: mockGetOrCreate,
  updateNotificationSettings: mockUpdate,
}));

describe("Notification settings route", () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockGetOrCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when unauthenticated on GET", async () => {
    mockSession.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it("returns settings when authenticated", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetOrCreate.mockResolvedValue({
      $id: "settings-1",
      userId: "user-1",
      globalNotifications: "all",
      desktopNotifications: true,
      pushNotifications: true,
      notificationSound: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      quietHoursTimezone: "UTC",
      serverOverrides: {},
      channelOverrides: {},
      conversationOverrides: {},
      $createdAt: "now",
      $updatedAt: "later",
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.userId).toBe("user-1");
    expect(data.globalNotifications).toBe("all");
    expect(data.quietHoursStart).toBe("22:00");
  });

  it("rejects invalid global notification level on PATCH", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetOrCreate.mockResolvedValue({ $id: "settings-1", userId: "user-1" });

    const request = new NextRequest("http://localhost/api/notifications/settings", {
      method: "PATCH",
      body: JSON.stringify({ globalNotifications: "invalid" }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid globalNotifications");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates settings when payload is valid", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetOrCreate.mockResolvedValue({ $id: "settings-1", userId: "user-1" });

    const overrides = [{ id: "server-1", level: "mentions" }];
    const updated = {
      $id: "settings-1",
      userId: "user-1",
      globalNotifications: "mentions",
      desktopNotifications: false,
      pushNotifications: true,
      notificationSound: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietHoursTimezone: null,
      serverOverrides: overrides,
      channelOverrides: [],
      conversationOverrides: [],
      $createdAt: "now",
      $updatedAt: "later",
    };

    mockUpdate.mockResolvedValue(updated);

    const request = new NextRequest("http://localhost/api/notifications/settings", {
      method: "PATCH",
      body: JSON.stringify({
        globalNotifications: "mentions",
        desktopNotifications: false,
        serverOverrides: overrides,
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      "settings-1",
      expect.objectContaining({
        globalNotifications: "mentions",
        serverOverrides: JSON.stringify(overrides),
      })
    );
    expect(data.globalNotifications).toBe("mentions");
    expect(data.serverOverrides).toEqual(overrides);
  });
});
