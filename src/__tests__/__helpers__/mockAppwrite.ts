import { vi } from "vitest";

// ---------------- Types ----------------
export type FailureConfig = {
  failCollections?: Record<string, Error | string>;
  onCreate?: (args: any) => void;
  userId?: string;
  idFactory?: () => string;
  overrides?: {
    createDocument?: (...args: any[]) => Promise<any>;
    listDocuments?: (...args: any[]) => Promise<any>;
    updateDocument?: (...args: any[]) => Promise<any>;
    deleteDocument?: (...args: any[]) => Promise<any>;
  };
};

export type MockAppwriteHandles = {
  created: Array<{ collectionId: string; data: any; permissions?: any }>;
  reset: () => void;
};

// ---------------- Internal Mutable State ----------------
let currentConfig: FailureConfig = {};
const createdCalls: MockAppwriteHandles["created"] = [];

// ---------------- Vitest Mock (hoisted) ----------------
// The factory only captures references to mutable objects so later configuration works.
vi.mock("appwrite", () => {
  class Client {
    setEndpoint() {
      return this;
    }
    setProject() {
      return this;
    }
  }

  class Account {
    get() {
      return Promise.resolve({ $id: currentConfig.userId || "user-test" });
    }
  }

  class Databases {
    createDocument(...args: any[]) {
      // Override path
      if (currentConfig.overrides?.createDocument) {
        return currentConfig.overrides.createDocument(...args);
      }
      let collectionId: string | undefined;
      let data: any;
      let permissions: any;
      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        !Array.isArray(args[0])
      ) {
        const opts = args[0];
        collectionId = opts.collectionId;
        data = opts.data;
        permissions = opts.permissions;
        currentConfig.onCreate?.(opts);
      } else {
        [, collectionId, , data, permissions] = args;
        currentConfig.onCreate?.({ collectionId, data, permissions });
      }
      if (!collectionId) {
        return Promise.reject(
          new Error("collectionId missing in createDocument mock")
        );
      }
      createdCalls.push({ collectionId, data, permissions });
      const fail = currentConfig.failCollections?.[collectionId];
      if (fail) {
        return Promise.reject(
          typeof fail === "string" ? new Error(fail) : fail
        );
      }
      const idFromArgs = args.length > 1 ? args[2] : undefined;
      return Promise.resolve({
        $id: idFromArgs || `${collectionId}-doc`,
        ...data,
      });
    }
    listDocuments(...args: any[]) {
      if (currentConfig.overrides?.listDocuments) {
        return currentConfig.overrides.listDocuments(...args);
      }
      return Promise.resolve({ documents: [] });
    }
    updateDocument(...args: any[]) {
      if (currentConfig.overrides?.updateDocument) {
        return currentConfig.overrides.updateDocument(...args);
      }
      if (args.length === 1 && typeof args[0] === "object") {
        const o = args[0];
        return Promise.resolve({ ...(o.data || {}), $id: o.documentId });
      }
      const [, , id, data] = args;
      return Promise.resolve({ $id: id, ...data });
    }
    deleteDocument(...args: any[]) {
      if (currentConfig.overrides?.deleteDocument) {
        return currentConfig.overrides.deleteDocument(...args);
      }
      return Promise.resolve({});
    }
  }

  const Permission = {
    read: (r: any) => `read:${r}`,
    update: (r: any) => `update:${r}`,
    delete: (r: any) => `delete:${r}`,
    write: (r: any) => `write:${r}`,
  };
  const Role = {
    any: () => "any",
    user: (id: string) => `user:${id}`,
    team: (id: string) => `team:${id}`,
  };
  const idUtil = {
    unique: () =>
      currentConfig.idFactory ? currentConfig.idFactory() : "unique",
  };
  const queryUtil = {
    limit: (n: number) => `limit(${n})`,
    cursorAfter: (id: string) => `cursorAfter(${id})`,
    orderAsc: (f: string) => `orderAsc(${f})`,
    orderDesc: (f: string) => `orderDesc(${f})`,
    equal: (k: string, v: any) => `equal(${k},${v})`,
  };

  const exported: any = {};
  exported.Client = Client;
  exported.Account = Account;
  exported.Databases = Databases;
  exported.Permission = Permission;
  exported.Role = Role;
  exported.ID = idUtil;
  exported.Query = queryUtil;
  return exported;
});

// ---------------- Public API ----------------
export function setupMockAppwrite(
  cfg: FailureConfig = {}
): MockAppwriteHandles {
  // mutate shared state for subsequent calls in mocked classes
  currentConfig = cfg;
  createdCalls.length = 0;
  return {
    created: createdCalls,
    reset: () => {
      createdCalls.length = 0;
    },
  };
}
