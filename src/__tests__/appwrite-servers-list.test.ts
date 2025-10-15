import { describe, expect, it } from "vitest";

import { setupMockAppwrite } from "./__helpers__/mockAppwrite";

// Extract regex constants to top level per style rules.
const limitRe = /limit\((\d+)\)/;
const cursorRe = /cursorAfter\(([^)]+)\)/;

function setEnv() {
  (process.env as any).APPWRITE_ENDPOINT = "http://x";
  (process.env as any).APPWRITE_PROJECT_ID = "p";
  (process.env as any).APPWRITE_DATABASE_ID = "db";
  (process.env as any).APPWRITE_SERVERS_COLLECTION_ID = "servers";
  (process.env as any).APPWRITE_CHANNELS_COLLECTION_ID = "channels";
  (process.env as any).APPWRITE_MEMBERSHIPS_COLLECTION_ID =
    "memberships";
}

describe("servers listing & pagination", () => {
  it("lists servers with ascending createdAt and paginates", async () => {
    const cache = (global as any).require?.cache || {};
    for (const k of Object.keys(cache)) {
      if (k.includes("appwrite-servers") || k.includes("appwrite-core")) {
        delete cache[k];
      }
    }
    // Override listDocuments via shared mock
    setupMockAppwrite({
      userId: "userX",
      overrides: {
        listDocuments: (opts: any) => {
          if (opts.collectionId === "servers") {
            const queries: string[] = opts.queries || [];
            const limitQ = queries.find((q) => q.startsWith("limit("));
            const limit = limitQ
              ? Number(limitQ.match(limitRe)?.[1])
              : pageLimit;
            const cursorQ = queries.find((q) => q.startsWith("cursorAfter("));
            let startIdx = 0;
            if (cursorQ) {
              const after = cursorQ.match(cursorRe)?.[1];
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
    setEnv();
    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();
    // fabricate two pages
    const docs = Array.from({ length: 7 }).map((_, i) => ({
      $id: `s${i + 1}`,
      name: `Server ${i + 1}`,
      $createdAt: `2024-01-0${i + 1}T00:00:00.000Z`,
      ownerId: "userX",
    }));
    const pageLimit = 3;
    const { listServersPage } = await import("../lib/appwrite-servers");
    const first = await listServersPage(pageLimit);
    expect(first.servers.length).toBe(pageLimit);
    expect(first.nextCursor).toBe("s3");
    const second = await listServersPage(
      pageLimit,
      first.nextCursor || undefined
    );
    expect(second.servers.map((s) => s.$id)).toEqual(["s4", "s5", "s6"]);
    const third = await listServersPage(
      pageLimit,
      second.nextCursor || undefined
    );
    expect(third.servers.map((s) => s.$id)).toEqual(["s7"]);
    expect(third.nextCursor).toBeNull();
  });
});
