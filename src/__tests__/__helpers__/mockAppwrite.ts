import type { Databases } from "appwrite";
import { vi } from "vitest";

// ---------------- Types ----------------
type CreateDocumentArgs = Parameters<Databases["createDocument"]>;
type CreateDocumentResult = ReturnType<Databases["createDocument"]>;
type ListDocumentsArgs = Parameters<Databases["listDocuments"]>;
type ListDocumentsResult = ReturnType<Databases["listDocuments"]>;
type UpdateDocumentArgs = Parameters<Databases["updateDocument"]>;
type UpdateDocumentResult = ReturnType<Databases["updateDocument"]>;
type DeleteDocumentArgs = Parameters<Databases["deleteDocument"]>;
type DeleteDocumentResult = ReturnType<Databases["deleteDocument"]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type FailureConfig = {
  failCollections?: Record<string, Error | string>;
  onCreate?: (args: {
    collectionId?: string;
    data?: unknown;
    permissions?: unknown;
  }) => void;
  userId?: string;
  idFactory?: () => string;
  overrides?: {
    createDocument?: (...args: CreateDocumentArgs) => CreateDocumentResult;
    listDocuments?: (...args: ListDocumentsArgs) => ListDocumentsResult;
    updateDocument?: (...args: UpdateDocumentArgs) => UpdateDocumentResult;
    deleteDocument?: (...args: DeleteDocumentArgs) => DeleteDocumentResult;
  };
};

export type MockAppwriteHandles = {
  created: Array<{
    collectionId: string;
    data: unknown;
    permissions?: unknown;
  }>;
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
    createDocument(...args: unknown[]) {
      // Override path
      if (currentConfig.overrides?.createDocument) {
        return currentConfig.overrides.createDocument(
          ...(args as CreateDocumentArgs)
        );
      }
      let collectionId: string | undefined;
      let documentId: string | undefined;
      let data: unknown;
      let permissions: unknown;
      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        args[0] !== null &&
        !Array.isArray(args[0])
      ) {
        const opts = args[0] as {
          documentId?: unknown;
          collectionId?: unknown;
          data?: unknown;
          permissions?: unknown;
        };
        documentId =
          typeof opts.documentId === "string" ? opts.documentId : undefined;
        collectionId =
          typeof opts.collectionId === "string" ? opts.collectionId : undefined;
        data = opts.data;
        permissions = opts.permissions;
        currentConfig.onCreate?.({ collectionId, data, permissions });
      } else {
        collectionId = typeof args[1] === "string" ? args[1] : undefined;
        data =
          isPlainObject(args[3])
            ? args[3]
            : undefined;
        permissions = Array.isArray(args[4]) ? args[4] : undefined;
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
      const idFromArgs =
        documentId ??
        (args.length > 1 && typeof args[2] === "string" ? args[2] : undefined);
      const safeData =
        isPlainObject(data)
          ? data
          : {};
      return Promise.resolve({
        $id: idFromArgs || `${collectionId}-doc`,
        ...safeData,
      });
    }
    listDocuments(...args: unknown[]) {
      if (currentConfig.overrides?.listDocuments) {
        return currentConfig.overrides.listDocuments(
          ...(args as ListDocumentsArgs)
        );
      }
      return Promise.resolve({ documents: [] });
    }
    updateDocument(...args: unknown[]) {
      if (currentConfig.overrides?.updateDocument) {
        return currentConfig.overrides.updateDocument(
          ...(args as UpdateDocumentArgs)
        );
      }
      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        args[0] !== null &&
        !Array.isArray(args[0])
      ) {
        const o = args[0] as { data?: Record<string, unknown>; documentId?: unknown };
        return Promise.resolve({ ...(isPlainObject(o.data) ? o.data : {}), $id: o.documentId });
      }
      const [, , id, data] = args;
      const safeData = isPlainObject(data) ? data : {};
      return Promise.resolve({ $id: id, ...safeData });
    }
    deleteDocument(...args: unknown[]) {
      if (currentConfig.overrides?.deleteDocument) {
        return currentConfig.overrides.deleteDocument(
          ...(args as DeleteDocumentArgs)
        );
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
    offset: (n: number) => `offset(${n})`,
    cursorAfter: (id: string) => `cursorAfter(${id})`,
    orderAsc: (f: string) => `orderAsc(${f})`,
    orderDesc: (f: string) => `orderDesc(${f})`,
    equal: (k: string, v: any) => `equal(${k},${v})`,
    select: (fields: string[]) => `select(${JSON.stringify(fields)})`,
  };

  class Storage {
    getFile() {
      return Promise.resolve({});
    }
    deleteFile() {
      return Promise.resolve({});
    }
  }

  class Teams {
    list() {
      return Promise.resolve({ teams: [] });
    }
  }

  const exported: any = {};
  exported.Client = Client;
  exported.Account = Account;
  exported.Databases = Databases;
  exported.Storage = Storage;
  exported.Teams = Teams;
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
