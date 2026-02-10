import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockListDocuments } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
  Query: {
    equal: vi.fn((field: string, value: unknown) => ({ field, value })),
    orderDesc: vi.fn((field: string) => ({ order: field })),
    limit: vi.fn((n: number) => ({ limit: n })),
  },
}));

vi.mock("@/lib/appwrite-server", () => ({
  getServerClient: vi.fn(() => ({
    databases: {
      listDocuments: mockListDocuments,
    },
  })),
}));

async function loadRoute() {
  vi.resetModules();
  const module = await import("../../app/api/servers/[serverId]/audit-logs/route");
  return module;
}

describe("audit logs route", () => {
  beforeEach(() => {
    mockListDocuments.mockReset();
    process.env.APPWRITE_DATABASE_ID = "db";
    process.env.APPWRITE_AUDIT_COLLECTION_ID = "audit";
    process.env.APPWRITE_PROFILES_COLLECTION_ID = "profiles";
  });

  it("returns 500 when audit logging is not configured", async () => {
    process.env.APPWRITE_AUDIT_COLLECTION_ID = "";
    const { GET } = await loadRoute();

    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe("Audit logging not configured");
  });

  it("returns enriched audit logs", async () => {
    const { GET } = await loadRoute();

    mockListDocuments
      .mockResolvedValueOnce({
        documents: [
          {
            $id: "log-1",
            $createdAt: "2024-01-01T00:00:00Z",
            userId: "mod-1",
            targetUserId: "user-1",
            action: "ban",
            reason: "rule",
            details: "details",
          },
        ],
      })
      .mockResolvedValueOnce({
        documents: [
          {
            userId: "mod-1",
            displayName: "Moderator",
            userName: "moderator",
            avatarUrl: "mod.png",
          },
          {
            userId: "user-1",
            displayName: "Target",
            userName: "target",
            avatarUrl: "target.png",
          },
        ],
      });

    const response = await GET(new NextRequest("http://localhost/api/servers/server-1/audit-logs?limit=5"), {
      params: Promise.resolve({ serverId: "server-1" }),
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].moderatorId).toBe("mod-1");
    expect(data[0].moderatorName).toBe("Moderator");
    expect(data[0].targetUserId).toBe("user-1");
    expect(data[0].targetUserName).toBe("Target");
  });
});
