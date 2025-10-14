import { describe, expect, it } from "vitest";

import { setupMockAppwrite } from "./__helpers__/mockAppwrite";

// Utility to set minimal env
function baseEnv() {
  (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
  (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
  (process.env as any).NEXT_PUBLIC_APPWRITE_DATABASE_ID = "db";
  (process.env as any).NEXT_PUBLIC_APPWRITE_SERVERS_COLLECTION_ID = "servers";
  (process.env as any).NEXT_PUBLIC_APPWRITE_CHANNELS_COLLECTION_ID = "channels";
  (process.env as any).NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID = "messages";
  (process.env as any).NEXT_PUBLIC_APPWRITE_AUDIT_COLLECTION_ID = "audit";
}

describe("audit + diagnostics", () => {
  it("recordAudit no-ops when collection missing", async () => {
    setupMockAppwrite({});
    baseEnv();
    // Remove audit collection
    (process.env as any).NEXT_PUBLIC_APPWRITE_AUDIT_COLLECTION_ID = ""; // becomes null
    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();

    const { recordAudit } = await import("../lib/appwrite-audit");
    // Should not throw
    await recordAudit("delete", "t1", "actor1");
    // Underlying createDocument never called because collection disabled
  });

  it("recordAudit stores event and listAuditEvents paginates", async () => {
    const docs: any[] = [];
    setupMockAppwrite({
      overrides: {
        createDocument: (opts: any) => {
          if (opts.collectionId === "audit") {
            docs.push({ $id: `a${docs.length + 1}`, ...opts.data });
            return Promise.resolve({ $id: `a${docs.length}`, ...opts.data });
          }
          return Promise.resolve({
            $id: `${opts.collectionId}-x`,
            ...opts.data,
          });
        },
        listDocuments: (opts: any) => {
          if (opts.collectionId === "audit") {
            const limitQ = (opts.queries || []).find((q: string) =>
              q.startsWith("limit(")
            );
            const defaultLimit = 50;
            const limitPrefixLength = 6; // length of 'limit('
            const limit = limitQ
              ? Number(limitQ.slice(limitPrefixLength, limitQ.length - 1))
              : defaultLimit;
            const cursorQ = (opts.queries || []).find((q: string) =>
              q.startsWith("cursorAfter(")
            );
            let start = 0;
            if (cursorQ) {
              const cur = cursorQ.slice(
                "cursorAfter(".length,
                cursorQ.length - 1
              );
              const idx = docs.findIndex((d) => d.$id === cur);
              start = idx >= 0 ? idx + 1 : 0;
            }
            const slice = docs.slice(start, start + limit);
            return Promise.resolve({ documents: slice });
          }
          return Promise.resolve({ documents: [] });
        },
      },
    });
    baseEnv();
    (process.env as any).NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID = "teamAdmin";
    (process.env as any).NEXT_PUBLIC_APPWRITE_MODERATOR_TEAM_ID = "teamMod";
    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();

    const auditMod = await import("../lib/appwrite-audit");
    await auditMod.recordAudit("delete", "target1", "actor1", {
      reason: "test",
    });
    await auditMod.recordAudit("update", "target1", "actor1");
    await auditMod.recordAudit("create", "target2", "actor1");
    const smallLimit = 2;
    const page1 = await auditMod.listAuditEvents({ limit: smallLimit });
    expect(page1.items.length).toBe(2);
    const lastFirstPage = page1.items.at(-1);
    const cursor = lastFirstPage ? lastFirstPage.$id : undefined;
    const page2 = await auditMod.listAuditEvents({
      limit: smallLimit,
      cursorAfter: cursor,
    });
    expect(page2.items.length).toBe(1);
  });

  it("runAuthDiagnostics returns structured report without client when endpoint missing", async () => {
    // Clear env so makeBrowserClient returns null
    (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "";
    (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "";
    const { runAuthDiagnostics } = await import("../lib/appwrite-diagnostics");
    const rep = await runAuthDiagnostics();
    expect(rep.browserClientConfigured).toBe(false);
    expect(rep.collectionsTried).toHaveLength(0);
  });

  it("runAuthDiagnostics lists collections and captures failures", async () => {
    // Provide env
    baseEnv();
    setupMockAppwrite({
      overrides: {
        listDocuments: (...args: any[]) => {
          // Support both object-call and positional forms
          let collectionId: string | undefined;
          if (args.length === 1 && typeof args[0] === "object") {
            collectionId = args[0].collectionId;
          } else if (args.length >= 2) {
            collectionId = args[1]; // (dbId, collectionId, queries)
          }
          if (collectionId === "channels") {
            return Promise.reject(new Error("403 forbidden"));
          }
          return Promise.resolve({ documents: [{ $id: "x" }], total: 1 });
        },
      },
    });
    const core = await import("../lib/appwrite-core");
    core.resetEnvCache();

    const { runAuthDiagnostics } = await import("../lib/appwrite-diagnostics");
    const rep = await runAuthDiagnostics();
    expect(rep.browserClientConfigured).toBe(true);
    const channelEntry = rep.collectionsTried.find((c) => c.id === "channels");
    expect(channelEntry?.ok).toBe(false);
  });
});

describe("core error + retry helpers", () => {
  it("normalizeError wraps 401 and 403 patterns", async () => {
    const core = await import("../lib/appwrite-core");
    const { normalizeError } = core;
    expect(normalizeError(new Error("401 something")).name).toBe(
      "UnauthorizedError"
    );
    expect(normalizeError(new Error("forbidden access")).name).toBe(
      "ForbiddenError"
    );
  });
  it("withRetry succeeds on second attempt and stops after attempts", async () => {
    const { withRetry, UnauthorizedError } = await import(
      "../lib/appwrite-core"
    );
    let calls = 0;
    const retryAttempts = 3;
    const res = await withRetry(async () => {
      calls += 1;
      if (calls < 2) {
        await Promise.resolve(); // microtask to satisfy await rule
        throw new Error("temp");
      }
      return "ok";
    }, retryAttempts);
    expect(res).toBe("ok");
    expect(calls).toBe(2);
    let failCalls = 0;
    await expect(
      withRetry(async () => {
        failCalls += 1;
        await Promise.resolve();
        throw new UnauthorizedError("401 again");
      }, 2)
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(failCalls).toBe(2);
  });
  it("materializePermissions returns original for unknown entries", async () => {
    const { materializePermissions } = await import("../lib/appwrite-core");
    const perms = materializePermissions(['weird("nope")', 'read("any")']);
    expect(perms[0]).toBe('weird("nope")');
    expect(perms[1]).not.toBeUndefined();
  });
});
