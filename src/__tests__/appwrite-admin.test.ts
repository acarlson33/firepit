import { describe, expect, it, vi } from "vitest";

import {
  buildMessageQueries,
  listAllChannelsPage,
  listGlobalMessages,
  postFilterMessages,
} from "../lib/appwrite-admin";

const SMALL_LIMIT = 5;
const DEFAULT_LIMIT = 10;
const MIN_EXPECTED_EXTRA = 3; // used to validate additional filters added

// Minimal fake Query.* implementations shape assumptions (strings) - we only test presence logic.

describe("buildMessageQueries", () => {
  it("includes limit and order by default", () => {
    const q = buildMessageQueries({}, DEFAULT_LIMIT);
    expect(q.some((s) => s.includes("limit"))).toBe(true);
    expect(q.some((s) => s.includes("order"))).toBe(true);
  });
  it("adds cursorAfter", () => {
    const q = buildMessageQueries({ cursorAfter: "abc" }, 10);
    expect(q.some((s) => s.includes("abc"))).toBe(true);
  });
  it("adds user & channel filters", () => {
    const q = buildMessageQueries(
      { userId: "u1", channelId: "c1" },
      SMALL_LIMIT
    );
    expect(q.find((s) => s.includes("u1"))).toBeTruthy();
    expect(q.find((s) => s.includes("c1"))).toBeTruthy();
  });
  it("adds multi channel ids when provided", () => {
    const q = buildMessageQueries({ channelIds: ["c1", "c2"] }, SMALL_LIMIT);
    // Expect a serialized array reference
    expect(q.join("")).toContain("c1");
    expect(q.join("")).toContain("c2");
  });
  it("adds server & missing server filters", () => {
    const q = buildMessageQueries(
      { serverId: "s1", onlyMissingServerId: true },
      SMALL_LIMIT
    );
    expect(q.join("")).toContain("s1");
    // we cannot easily assert isNull string, but ensure length increased
    expect(q.length).toBeGreaterThan(MIN_EXPECTED_EXTRA);
  });
  it("adds text search if provided", () => {
    const q = buildMessageQueries({ text: "hello" }, SMALL_LIMIT);
    expect(q.join("")).toContain("hello");
  });
  it("adds removed filters", () => {
    const qOnly = buildMessageQueries({ onlyRemoved: true }, SMALL_LIMIT);
    const qInclude = buildMessageQueries({ includeRemoved: true }, SMALL_LIMIT);
    // onlyRemoved should differ from includeRemoved case
    expect(qOnly.join("")).not.toEqual(qInclude.join(""));
  });
});

describe("postFilterMessages", () => {
  const base = [
    { $id: "1", text: "Hello World", removedAt: undefined },
    { $id: "2", text: "Another thing", removedAt: undefined },
    { $id: "3", text: "Removed message", removedAt: "ts" },
    { $id: "4", text: "HELLO again", removedAt: undefined },
  ] as Array<{ $id: string; text?: string; removedAt?: string | undefined }>;
  it("filters by text (case insensitive substring)", () => {
    const res = postFilterMessages(base, { text: "hello" });
    expect(res.map((m: any) => m.$id)).toEqual(["1", "4"]);
  });
  it("filters only removed", () => {
    const res = postFilterMessages(base, { onlyRemoved: true });
    expect(res).toHaveLength(1);
    expect((res as any)[0].$id).toBe("3");
  });
  it("filters out removed unless includeRemoved", () => {
    const without = postFilterMessages(base, {});
    expect((without as any).find((m: any) => m.$id === "3")).toBeFalsy();
    const withRemoved = postFilterMessages(base, { includeRemoved: true });
    expect((withRemoved as any).find((m: any) => m.$id === "3")).toBeTruthy();
  });
});

// Mock server client for listAllChannelsPage / listGlobalMessages (Databases.listDocuments shape)
vi.mock("../lib/appwrite-core", async () => {
  const actual = await import("../lib/appwrite-core");
  const databases = {
    listDocuments: vi.fn((_db: string, col: string, queries: string[]) => {
      if (col === "channels") {
        // detect cursorAfter - Query helper returns strings that include "cursorAfter"
        const cursorQ = queries.find((q) => q.includes("cursorAfter"));
        const page1 = [
          { $id: "ch3", name: "Gamma" },
          { $id: "ch2", name: "Beta" },
        ];
        const page2 = [{ $id: "ch1", name: "Alpha" }];
        return Promise.resolve({
          documents: cursorQ ? page2 : [...page1, { bogus: true }],
        });
      }
      if (col === "messages") {
        const docs = [
          { $id: "m3", text: "Third" },
          { $id: "m2", text: "Second", removedAt: "ts" },
          { $id: "m1", text: "First" },
          { bad: true },
        ];
        return Promise.resolve({ documents: docs });
      }
      return Promise.resolve({ documents: [] });
    }),
  } as any;
  return {
    ...actual,
    getServerClient: () => ({ databases, teams: {} as any }),
  };
});

describe("admin channel & global message listing", () => {
  it("lists channels with pagination & filters malformed", async () => {
    (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
    (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_API_KEY = "k";
    const first = await listAllChannelsPage("s1", 2);
    expect(first.items.map((c) => c.$id)).toEqual(["ch3", "ch2"]);
    expect(first.nextCursor).toBe("ch2");
    const second = await listAllChannelsPage(
      "s1",
      2,
      first.nextCursor || undefined
    );
    expect(second.items.map((c) => c.$id)).toEqual(["ch1"]);
    expect(second.nextCursor).toBeNull();
  });
  it("lists global messages and applies limit/nextCursor logic", async () => {
    (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
    (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_API_KEY = "k";
    const page = await listGlobalMessages({ limit: 3 });
    expect(page.items.map((m) => m.$id)).toEqual(["m3", "m2", "m1"]);
    expect(page.nextCursor).toBe("m1");
  });
  it("returns empty on underlying listDocuments error", async () => {
    // Force error by resetting modules and mocking core before re-importing admin module

    vi.resetModules();
    vi.doMock("../lib/appwrite-core", async () => {
      const actual = await import("../lib/appwrite-core");
      return {
        ...actual,
        getServerClient: () => ({
          databases: { listDocuments: () => Promise.reject(new Error("boom")) },
          teams: {} as any,
        }),
      };
    });
    (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
    (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_API_KEY = "k";
    const mod = await import("../lib/appwrite-admin");
    const res = await mod.listAllChannelsPage("s1", 2);
    expect(res.items).toHaveLength(0);
    const res2 = await mod.listGlobalMessages({ limit: 2 });
    expect(res2.items).toHaveLength(0);
  });
});
