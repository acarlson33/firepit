import { describe, expect, it, vi } from "vitest";

// We'll import lazily after configuring env + mocks per test to avoid stale caches.
function load() {
  return import("../lib/appwrite-auth");
}

// Extend existing hoisted mock (already provided by helper in other tests) by re-mocking Account methods.
// Maintain a shared state so multiple Account() instances reflect session mutations (deleteSession)
vi.mock("appwrite", async (orig) => {
  const base: any = (await orig()) as any;
  const sharedState: { session: any; user: any } = {
    session: { $id: "sess1" },
    user: { $id: "user-123", email: "x@example.com" },
  };
  class Account extends base.Account {
    create(args: any) {
      return Promise.resolve({
        $id: args.userId,
        email: args.email,
        name: args.name,
      });
    }
    createEmailPasswordSession({ email, password }: any) {
      sharedState.session = { $id: "sess-created", email, password };
      return Promise.resolve(sharedState.session);
    }
    deleteSession() {
      sharedState.session = null;
      return Promise.resolve({});
    }
    get() {
      if (!sharedState.user) {
        return Promise.reject(new Error("no user"));
      }
      return Promise.resolve(sharedState.user);
    }
    getSession() {
      if (!sharedState.session) {
        return Promise.reject(new Error("no session"));
      }
      return Promise.resolve(sharedState.session);
    }
  }
  const accountClass = Account;
  const merged = { ...base, accountClass };
  Object.defineProperty(merged, "Account", {
    value: accountClass,
    enumerable: true,
  });
  return merged;
});

// Minimal env required by core
function setEnv() {
  (process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
  (process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
}

describe("appwrite-auth", () => {
  it("register creates user with random id", async () => {
    setEnv();
    const origUuid = (crypto as any).randomUUID;
    (crypto as any).randomUUID = () => "fixed-id";
    const { register } = await load();
    const u = await register("e@example.com", "pw", "Name");
    expect(u.$id).toBe("fixed-id");
    (crypto as any).randomUUID = origUuid;
  });
  it("login returns session object", async () => {
    setEnv();
    const { login } = await load();
    const sess = await login("e@example.com", "pw");
    expect(sess.$id).toBe("sess-created");
  });
  it("logout clears current session", async () => {
    setEnv();
    const firstMod = await load();
    const pre = await firstMod.getCurrentSession();
    expect(pre).toBeTruthy();
    await firstMod.logout();
    const after = await firstMod.getCurrentSession();
    expect(after).toBeNull();
  });
  it("getCurrentUser returns user then null after failure", async () => {
    setEnv();
    const firstMod = await load();
    const first = await firstMod.getCurrentUser();
    expect(first?.$id).toBe("user-123");
    // Reconfigure core to return an Account with failing get

    vi.resetModules();
    vi.doMock("appwrite", async (orig) => {
      const base: any = (await orig()) as any;
      class Account extends base.Account {
        get() {
          return Promise.reject(new Error("no user"));
        }
      }
      const accountClass = Account;
      const merged: any = { ...base, accountClass };
      Object.defineProperty(merged, "Account", {
        value: accountClass,
        enumerable: true,
      });
      return merged;
    });
    const mod2 = await import("../lib/appwrite-auth");
    const second = await mod2.getCurrentUser();
    expect(second).toBeNull();
  });
});
