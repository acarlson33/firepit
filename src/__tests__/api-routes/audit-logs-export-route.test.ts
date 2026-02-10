import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSession } = vi.hoisted(() => ({ mockSession: vi.fn() }));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockSession }));

async function loadRoute() {
  vi.resetModules();
  const module = await import("../../app/api/servers/[serverId]/audit-logs/export/route");
  return module;
}

describe("audit logs export route", () => {
  beforeEach(() => {
    mockSession.mockReset();
    global.fetch = vi.fn();
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs/export"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns JSON export by default", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    (global.fetch as unknown as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ timestamp: "t", action: "ban", moderatorId: "mod-1" }],
    });

    const { GET } = await loadRoute();
    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs/export"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const text = await response.text();
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(text).toContain("ban");
  });

  it("returns CSV when requested", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    (global.fetch as unknown as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          timestamp: "t1",
          action: "ban",
          moderatorId: "mod-1",
          moderatorName: "Mod",
          targetUserId: "user-1",
          targetUserName: "Target",
          reason: "rule",
          details: "details",
        },
      ],
    });

    const { GET } = await loadRoute();
    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs/export?format=csv"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const text = await response.text();
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(text).toContain("Moderator ID");
    expect(text).toContain("ban");
  });

  it("returns 500 when upstream fetch fails", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    (global.fetch as unknown as vi.Mock).mockResolvedValue({ ok: false });

    const { GET } = await loadRoute();
    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs/export"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch audit logs");
  });
});
