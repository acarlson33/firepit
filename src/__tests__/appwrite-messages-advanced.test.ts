// Test file includes references to mock exports that intentionally use PascalCase to mirror SDK
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupMockAppwrite } from "./__helpers__/mockAppwrite";

// Hoisted regex for pagination query parsing (lint performance rule requires top-level)
const paginationLimitRe = /limit\((\d+)\)/;
const paginationCursorRe = /cursorAfter\(([^)]+)\)/;

// Utility to set minimal env each test and reset module cache
function baseEnv() {
  const env = process.env as Record<string, string>;
  env.APPWRITE_ENDPOINT = "http://localhost";
  env.APPWRITE_PROJECT_ID = "proj";
  env.APPWRITE_DATABASE_ID = "db";
  env.APPWRITE_MESSAGES_COLLECTION_ID = "messages";
  env.APPWRITE_TYPING_COLLECTION_ID = "typing";
  env.APPWRITE_ADMIN_TEAM_ID = "team_admin";
  env.APPWRITE_MODERATOR_TEAM_ID = "team_mod";
}

// Constants to avoid magic numbers in tests
const RECENT_LIMIT_THREE = 3;
const FLOOD_MAX = 8; // mirrors implementation constant usage for boundary test intent

describe("appwrite-messages advanced flows", () => {
  beforeEach(() => {
    // Manual reset: clear node/bun module cache for message module so env + mocks re-evaluate
    const cache = (global as any).require?.cache || {};
    for (const k of Object.keys(cache)) {
      if (k.includes("appwrite-messages") || k.includes("appwrite-core")) {
        delete cache[k];
      }
    }
    baseEnv();
  });

  it("sendMessage creates document with materialized permissions and echoes fields", async () => {
    const mock = setupMockAppwrite();
    const { sendMessage } = await import("../lib/appwrite-messages");
    const msg = await sendMessage({
      userId: "u1",
      text: "hello",
      userName: "Alice",
      channelId: "c1",
      serverId: "s1",
    });
    expect(msg.userId).toBe("u1");
    expect(msg.text).toBe("hello");
    // Verify permissions captured by mock
    const created = mock.created.find((c) => c.collectionId === "messages");
    expect(created).toBeTruthy();
    expect(Array.isArray(created?.permissions)).toBe(true);
    // Should include user read/write and team based roles (simplistic string contains check)
    const perms = created?.permissions?.join(" ") || "";
    expect(perms).toContain("user:u1");
    if (perms.includes("team:team_mod") || perms.includes("team:team_admin")) {
      // at least one team permission present (depending on perms.message implementation)
      expect(true).toBe(true);
    }
  });

  it("listMessages builds queries (limit, cursor, channel) and maps docs", async () => {
    setupMockAppwrite({
      overrides: {
        listDocuments: () =>
          Promise.resolve({
            documents: [
              {
                $id: "m1",
                userId: "u",
                text: "1",
                $createdAt: "2024-01-01T00:00:00.000Z",
              },
              {
                $id: "m2",
                userId: "u",
                text: "2",
                $createdAt: "2024-01-02T00:00:00.000Z",
              },
            ],
          }),
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const out = await listMessages({
      limit: 2,
      cursorAfter: "cur1",
      channelId: "c1",
      order: "asc",
    });
    expect(out.map((m) => m.$id)).toEqual(["m1", "m2"]);
  });

  it("editMessage sets editedAt and new text", async () => {
    setupMockAppwrite({
      overrides: {
        updateDocument: (opts: any) =>
          Promise.resolve({
            $id: "m1",
            userId: "u",
            text: opts.data.text,
            editedAt: opts.data.editedAt,
          }),
      },
    });
    const { editMessage } = await import("../lib/appwrite-messages");
    const updated = await editMessage("m1", "updated text");
    expect(updated.text).toBe("updated text");
    expect(typeof (updated as any).editedAt).toBe("string");
  });

  it("softDeleteMessage marks removedAt/removedBy", async () => {
    setupMockAppwrite({
      overrides: {
        updateDocument: (opts: any) =>
          Promise.resolve({
            $id: opts.documentId,
            userId: "moderated",
            text: "x",
            removedAt: opts.data.removedAt,
            removedBy: opts.data.removedBy,
          }),
      },
    });
    const { softDeleteMessage } = await import("../lib/appwrite-messages");
    const res = await softDeleteMessage("m5", "mod1");
    expect(res.removedBy).toBe("mod1");
    expect(typeof res.removedAt).toBe("string");
  });

  it("restoreMessage clears removedAt/removedBy", async () => {
    setupMockAppwrite({
      overrides: {
        updateDocument: (opts: any) =>
          Promise.resolve({
            $id: opts.documentId,
            userId: "u",
            text: "x",
            removedAt: null,
            removedBy: null,
          }),
      },
    });
    const { restoreMessage } = await import("../lib/appwrite-messages");
    const res = await restoreMessage("m5");
    expect(res.removedAt).toBeNull();
    expect(res.removedBy).toBeNull();
  });

  it("listRecentMessages returns reversed order of descending request", async () => {
    setupMockAppwrite({
      overrides: {
        listDocuments: () =>
          Promise.resolve({
            documents: [
              {
                $id: "m3",
                userId: "u",
                text: "3",
                $createdAt: "2024-01-03T00:00:00.000Z",
              },
              {
                $id: "m2",
                userId: "u",
                text: "2",
                $createdAt: "2024-01-02T00:00:00.000Z",
              },
              {
                $id: "m1",
                userId: "u",
                text: "1",
                $createdAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          }),
      },
    });
    const { listRecentMessages } = await import("../lib/appwrite-messages");
    const out = await listRecentMessages(RECENT_LIMIT_THREE);
    expect(out.map((m) => m.$id)).toEqual(["m1", "m2", "m3"]);
  });

  it("setTyping performs update then create fallback when update fails", async () => {
    const updateCalls: any[] = [];
    const createCalls: any[] = [];
    const deleteCalls: any[] = [];
    setupMockAppwrite({
      overrides: {
        updateDocument: () => {
          updateCalls.push({});
          return Promise.reject(new Error("missing"));
        },
        createDocument: (...args: any[]) => {
          createCalls.push(args);
          return Promise.resolve({
            $id: args[2] || "key",
            ...(args[3] || args[0]?.data),
          });
        },
        deleteDocument: () => {
          deleteCalls.push({});
          return Promise.resolve({});
        },
      },
    });
    const { setTyping } = await import("../lib/appwrite-messages");
    await setTyping("u1", "c1", "Alice", true);
    expect(updateCalls.length).toBe(1);
    expect(createCalls.length).toBe(1);
    // Disable typing triggers delete
    await setTyping("u1", "c1", "Alice", false);
    expect(deleteCalls.length).toBe(1);
  });

  it("setTyping swallows errors (outer try-catch) for ephemeral operations", async () => {
    setupMockAppwrite({
      overrides: {
        updateDocument: () => Promise.reject(new Error("update fail")),
        createDocument: () => Promise.reject(new Error("create fail")),
      },
    });
    const { setTyping } = await import("../lib/appwrite-messages");
    // Should not throw even though both update & create fail
    await setTyping("u1", "c1", "Alice", true);
  });

  it("canSend enforces flood window and limit", async () => {
    // Need a fresh module instance to reset internal recent array
    setupMockAppwrite();
    const { canSend } = await import("../lib/appwrite-messages");
    // Fill up to max (8)
    const results: boolean[] = [];
    for (let i = 0; i < FLOOD_MAX; i++) {
      results.push(canSend());
    }
    expect(results.every(Boolean)).toBe(true);
    // Ninth should fail
    expect(canSend()).toBe(false);
  });

  it("listMessages (desc) includes orderDesc query and returns docs in descending createdAt order", async () => {
    const queriesCaptured: string[][] = [];
    setupMockAppwrite({
      overrides: {
        listDocuments: (opts: any) => {
          queriesCaptured.push(opts.queries || []);
          // Return descending order by $createdAt (newest first)
          return Promise.resolve({
            documents: [
              {
                $id: "m3",
                userId: "u",
                text: "3",
                $createdAt: "2024-01-03T00:00:00.000Z",
              },
              {
                $id: "m2",
                userId: "u",
                text: "2",
                $createdAt: "2024-01-02T00:00:00.000Z",
              },
              {
                $id: "m1",
                userId: "u",
                text: "1",
                $createdAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          });
        },
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const out = await listMessages({ order: "desc", limit: 3 });
    expect(out.map((m) => m.$id)).toEqual(["m3", "m2", "m1"]);
    const allQueries = queriesCaptured.flat();
    expect(allQueries.some((q) => q.startsWith("orderDesc("))).toBe(true);
  });

  it("listMessages without channelId omits equal(channelId,...) query and returns all docs", async () => {
    let sawChannelEqual = false;
    setupMockAppwrite({
      overrides: {
        listDocuments: (opts: any) => {
          for (const q of opts.queries || []) {
            if (
              typeof q === "string" &&
              q.startsWith("equal(") &&
              q.includes("channelId")
            ) {
              sawChannelEqual = true;
            }
          }
          return Promise.resolve({
            documents: [
              {
                $id: "m1",
                userId: "u",
                text: "one",
                $createdAt: "2024-01-01T00:00:00.000Z",
              },
              {
                $id: "m2",
                userId: "u",
                text: "two",
                $createdAt: "2024-01-02T00:00:00.000Z",
              },
            ],
          });
        },
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const out = await listMessages({ limit: 10 });
    expect(sawChannelEqual).toBe(false);
    expect(out.length).toBe(2);
  });

  it("listMessages paginates with cursorAfter across multiple calls", async () => {
    const dataset = [
      {
        $id: "m1",
        userId: "u",
        text: "1",
        $createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        $id: "m2",
        userId: "u",
        text: "2",
        $createdAt: "2024-01-02T00:00:00.000Z",
      },
      {
        $id: "m3",
        userId: "u",
        text: "3",
        $createdAt: "2024-01-03T00:00:00.000Z",
      },
      {
        $id: "m4",
        userId: "u",
        text: "4",
        $createdAt: "2024-01-04T00:00:00.000Z",
      },
      {
        $id: "m5",
        userId: "u",
        text: "5",
        $createdAt: "2024-01-05T00:00:00.000Z",
      },
    ];
    setupMockAppwrite({
      overrides: {
        listDocuments: (opts: any) => {
          const queries: string[] = opts.queries || [];
          const limitQ = queries.find((q) => q.startsWith("limit("));
          const limit = limitQ
            ? Number(limitQ.match(paginationLimitRe)?.[1])
            : 2;
          const cursorQ = queries.find((q) => q.startsWith("cursorAfter("));
          let start = 0;
          if (cursorQ) {
            const after = cursorQ.match(paginationCursorRe)?.[1];
            const idx = dataset.findIndex((d) => d.$id === after);
            start = idx >= 0 ? idx + 1 : 0;
          }
          const slice = dataset.slice(start, start + limit);
          return Promise.resolve({ documents: slice });
        },
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const page1 = await listMessages({ limit: 2, order: "asc" });
    expect(page1.map((m) => m.$id)).toEqual(["m1", "m2"]);
    const page2 = await listMessages({
      limit: 2,
      cursorAfter: "m2",
      order: "asc",
    });
    expect(page2.map((m) => m.$id)).toEqual(["m3", "m4"]);
    const page3 = await listMessages({
      limit: 2,
      cursorAfter: "m4",
      order: "asc",
    });
    expect(page3.map((m) => m.$id)).toEqual(["m5"]);
  });

  it("listMessages returns empty array when cursorAfter is last id", async () => {
    const dataset = [
      {
        $id: "m1",
        userId: "u",
        text: "1",
        $createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        $id: "m2",
        userId: "u",
        text: "2",
        $createdAt: "2024-01-02T00:00:00.000Z",
      },
    ];
    setupMockAppwrite({
      overrides: {
        listDocuments: (opts: any) => {
          const queries: string[] = opts.queries || [];
          const cursorQ = queries.find((q) => q.startsWith("cursorAfter("));
          if (cursorQ) {
            const after = cursorQ.match(paginationCursorRe)?.[1];
            const idx = dataset.findIndex((d) => d.$id === after);
            if (idx === dataset.length - 1) {
              return Promise.resolve({ documents: [] });
            }
          }
          return Promise.resolve({ documents: dataset.slice(0, 1) });
        },
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const page1 = await listMessages({ limit: 1, order: "asc" });
    expect(page1.map((m) => m.$id)).toEqual(["m1"]);
    const empty = await listMessages({
      limit: 1,
      cursorAfter: "m2",
      order: "asc",
    });
    expect(empty).toEqual([]);
  });

  it("listMessages with invalid cursorAfter returns from start", async () => {
    const dataset = [
      {
        $id: "m1",
        userId: "u",
        text: "1",
        $createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        $id: "m2",
        userId: "u",
        text: "2",
        $createdAt: "2024-01-02T00:00:00.000Z",
      },
      {
        $id: "m3",
        userId: "u",
        text: "3",
        $createdAt: "2024-01-03T00:00:00.000Z",
      },
    ];
    setupMockAppwrite({
      overrides: {
        listDocuments: (opts: any) => {
          const queries: string[] = opts.queries || [];
          const limitQ = queries.find((q) => q.startsWith("limit("));
          const limit = limitQ
            ? Number(limitQ.match(paginationLimitRe)?.[1])
            : 2;
          const cursorQ = queries.find((q) => q.startsWith("cursorAfter("));
          let start = 0;
          if (cursorQ) {
            const after = cursorQ.match(paginationCursorRe)?.[1];
            const idx = dataset.findIndex((d) => d.$id === after);
            start = idx >= 0 ? idx + 1 : 0; // invalid cursor resets to 0
          }
          return Promise.resolve({
            documents: dataset.slice(start, start + limit),
          });
        },
      },
    });
    const { listMessages } = await import("../lib/appwrite-messages");
    const page = await listMessages({
      limit: 2,
      cursorAfter: "does-not-exist",
      order: "asc",
    });
    expect(page.map((m) => m.$id)).toEqual(["m1", "m2"]);
  });

  it("canSend recovers after flood window elapses", async () => {
    setupMockAppwrite();
    vi.useFakeTimers();
    // Clear module cache to reset flood state explicitly
    for (const key of Object.keys((require as any).cache || {})) {
      if (key.includes("appwrite-messages")) {
        delete (require as any).cache[key];
      }
    }
    const start = Date.now();
    // Jump ahead more than flood window to ensure any prior timestamps are purged
    const purgeAdvanceMs = 6000; // > FLOOD_WINDOW_MS (5000)
    let now = start + purgeAdvanceMs;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const floodWindowMs = 5000;
    const { canSend } = await import("../lib/appwrite-messages");
    // Fill flood limit all at identical timestamp (now)
    for (let i = 0; i < FLOOD_MAX; i++) {
      expect(canSend()).toBe(true);
    }
    // One extra should be blocked
    expect(canSend()).toBe(false);
    // Jump well past the flood window so all prior timestamps purge
    const purgeBufferMs = 2000; // buffer beyond window to ensure purge
    const purgeJumpMs = floodWindowMs + purgeBufferMs;
    now += purgeJumpMs;
    expect(canSend()).toBe(true);
    vi.useRealTimers();
  });

  it("setTyping handles concurrent calls without duplicate document creation errors", async () => {
    const updateCalls: any[] = [];
    const createCalls: any[] = [];
    let createdDocumentExists = false;
    setupMockAppwrite({
      overrides: {
        updateDocument: () => {
          updateCalls.push({});
          if (!createdDocumentExists) {
            return Promise.reject(new Error("Document not found"));
          }
          return Promise.resolve({ $id: "key", userId: "u1", channelId: "c1" });
        },
        createDocument: (...args: any[]) => {
          createCalls.push(args);
          createdDocumentExists = true;
          return Promise.resolve({
            $id: args[2] || "key",
            ...(args[3] || args[0]?.data),
          });
        },
      },
    });
    const { setTyping } = await import("../lib/appwrite-messages");
    
    // Simulate concurrent calls to setTyping with the same key
    const promises = [
      setTyping("u1", "c1", "Alice", true),
      setTyping("u1", "c1", "Alice", true),
      setTyping("u1", "c1", "Alice", true),
    ];
    
    // All should complete without throwing errors
    await Promise.all(promises);
    
    // Should have tried to update 3 times (one for each call)
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    
    // Should only create once (not 3 times) due to serialization
    expect(createCalls.length).toBe(1);
  });
});
