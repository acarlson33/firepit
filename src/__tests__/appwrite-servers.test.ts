import { describe, expect, it } from "vitest";

// Hoisted regex patterns
const limitRegex = /limit\((\d+)\)/;
const cursorRegex = /cursorAfter\(([^)]+)\)/;

import { setupMockAppwrite } from "./__helpers__/mockAppwrite";

// Tests the fallback (non-throwing) branches inside createServer where
// membership creation and channel creation failures are swallowed.

describe("createServer fallback branches", () => {
  it("swallows membership creation failure and still returns server + attempts channel", async () => {
    const cache = (global as any).require?.cache || {};
    for (const k of Object.keys(cache)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache[k];
      }
    }
    const created: Array<{ collection: string; data: any }> = [];
    setupMockAppwrite({
      userId: "userA",
      overrides: {
        createDocument: (opts: any) => {
          const { collectionId, data } = opts || {};
          created.push({ collection: collectionId, data });
          if (collectionId === "memberships") {
            return Promise.reject(new Error("membership boom"));
          }
          return Promise.resolve({ $id: `${collectionId}-doc`, ...data });
        },
      },
    });

    // Environment
    (process.env as any).APPWRITE_ENDPOINT = "http://x";
    (process.env as any).APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_DATABASE_ID = "db";
    (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
    (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID =
      "channels";
    (process.env as any).APPWRITE_MEMBERSHIPS_COLLECTION_ID =
      "memberships";

    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();
    const { createServer } = await import("../lib/appwrite-servers");
    const server = await createServer("Srv One", { bypassFeatureCheck: true });
    expect(server.name).toBe("Srv One");
    // Ensure membership attempt happened and then channel attempt despite failure
    const collections = created.map((c) => c.collection);
    expect(collections[0]).toBe("servers");
    expect(collections).toContain("memberships");
    expect(collections).toContain("channels");
  });

  it("swallows channel creation failure and still returns server + attempts membership", async () => {
    const cache2 = (global as any).require?.cache || {};
    for (const k of Object.keys(cache2)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache2[k];
      }
    }
    const created: Array<{ collection: string; data: any }> = [];
    setupMockAppwrite({
      userId: "userB",
      overrides: {
        createDocument: (opts: any) => {
          const { collectionId, data } = opts || {};
          created.push({ collection: collectionId, data });
          if (collectionId === "channels") {
            return Promise.reject(new Error("channel boom"));
          }
          return Promise.resolve({ $id: `${collectionId}-doc`, ...data });
        },
      },
    });

    // Environment
    (process.env as any).APPWRITE_ENDPOINT = "http://x";
    (process.env as any).APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_DATABASE_ID = "db";
    (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
    (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID =
      "channels";
    (process.env as any).APPWRITE_MEMBERSHIPS_COLLECTION_ID =
      "memberships";

    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();
    const { createServer } = await import("../lib/appwrite-servers");
    const server = await createServer("Srv Two", { bypassFeatureCheck: true });
    expect(server.name).toBe("Srv Two");
    const collections = created.map((c) => c.collection);
    expect(collections[0]).toBe("servers");
    expect(collections).toContain("memberships");
    expect(collections).toContain("channels"); // attempted even though it failed
  });
  it("listMembershipsForUser returns empty + joinServer returns null when memberships disabled", async () => {
    // Clear module cache first
    const cache3 = (global as any).require?.cache || {};
    for (const k of Object.keys(cache3)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache3[k];
      }
    }
    
    // Ensure membership collection is omitted by deleting ALL related env vars
    delete (process.env as any).APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    delete (process.env as any).NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    
    setupMockAppwrite({ userId: "userNoMem" });
    (process.env as any).APPWRITE_ENDPOINT = "http://x";
    (process.env as any).APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_DATABASE_ID = "db";
    (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
    (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID =
      "channels";
    
    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();
    // Reset module registry for servers so it re-reads env

    const mod = await import("../lib/appwrite-servers");
    const memberships = await mod.listMembershipsForUser("userNoMem");
    expect(memberships).toEqual([]);
    const joined = await mod.joinServer("s1", "userNoMem");
    expect(joined).toBeNull();
  });
  it("deleteServer cascades channel deletions and swallows list failure", async () => {
    const cache4 = (global as any).require?.cache || {};
    for (const k of Object.keys(cache4)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache4[k];
      }
    }
    const deleted: string[] = [];
    let failList = true;
    setupMockAppwrite({
      userId: "userDel",
      overrides: {
        listDocuments: (opts: any) => {
          if (opts.collectionId === "channels") {
            if (failList) {
              failList = false;
              return Promise.reject(new Error("list err"));
            }
            return Promise.resolve({
              documents: [
                { $id: "c1", serverId: "s1" },
                { $id: "c2", serverId: "s1" },
              ],
            });
          }
          return Promise.resolve({ documents: [] });
        },
        deleteDocument: (opts: any) => {
          deleted.push(opts.documentId);
          return Promise.resolve({});
        },
      },
    });
    (process.env as any).APPWRITE_ENDPOINT = "http://x";
    (process.env as any).APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_DATABASE_ID = "db";
    (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
    (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID =
      "channels";
    const core2 = await import("../lib/appwrite-core");
    core2.resetEnvCache();
    const { deleteServer } = await import("../lib/appwrite-servers");
    await deleteServer("s1");
    // After first failure, second attempt should succeed listing none (since we didn't call listing again) but server delete should still happen
    // We only track deleted doc ids; ensure server id present
    expect(deleted).toContain("s1");
  });
  it("listChannelsPage paginates and nextCursor logic works", async () => {
    const cache5 = (global as any).require?.cache || {};
    for (const k of Object.keys(cache5)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache5[k];
      }
    }
    const docs = Array.from({ length: 4 }).map((_, i) => ({
      $id: `ch${i + 1}`,
      serverId: "s-main",
      name: `Chan ${i + 1}`,
      $createdAt: `2024-01-0${i + 1}`,
    }));
    setupMockAppwrite({
      userId: "userChan",
      overrides: {
        listDocuments: (opts: any) => {
          if (opts.collectionId === "channels") {
            const limitQ = (opts.queries || []).find((q: string) =>
              q.startsWith("limit(")
            );
            const limit = limitQ ? Number(limitQ.match(limitRegex)?.[1]) : 2;
            const cursorQ = (opts.queries || []).find((q: string) =>
              q.startsWith("cursorAfter(")
            );
            let startIdx = 0;
            if (cursorQ) {
              const after = cursorQ.match(cursorRegex)?.[1];
              const pos = docs.findIndex((d) => d.$id === after);
              startIdx = pos >= 0 ? pos + 1 : 0;
            }
            const slice = docs.slice(startIdx, startIdx + limit);
            return Promise.resolve({ documents: slice });
          }
          return Promise.resolve({ documents: [] });
        },
      },
    });
    (process.env as any).APPWRITE_ENDPOINT = "http://x";
    (process.env as any).APPWRITE_PROJECT_ID = "p";
    (process.env as any).APPWRITE_DATABASE_ID = "db";
    (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
    (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID =
      "channels";
    const core3 = await import("../lib/appwrite-core");
    core3.resetEnvCache();
    const { listChannelsPage } = await import("../lib/appwrite-servers");
    const first = await listChannelsPage("s-main", 2);
    expect(first.channels.map((c) => c.$id)).toEqual(["ch1", "ch2"]);
    expect(first.nextCursor).toBe("ch2");
    const second = await listChannelsPage(
      "s-main",
      2,
      first.nextCursor || undefined
    );
    expect(second.channels.map((c) => c.$id)).toEqual(["ch3", "ch4"]);
    // Because second page is full, we expect a nextCursor referencing last item
    expect(second.nextCursor).toBe("ch4");
    const third = await listChannelsPage(
      "s-main",
      2,
      second.nextCursor || undefined
    );
    expect(third.channels).toHaveLength(0);
    expect(third.nextCursor).toBeNull();
  });
});
