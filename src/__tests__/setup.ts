import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";
import path from "node:path";

// Load environment variables from .env.local for testing
config({ path: path.resolve(process.cwd(), ".env.local") });

// happy-dom environment is configured in vitest.config.ts
// No need to manually set up DOM globals - Vitest does this automatically

// Global mock for appwrite SDK - applied to all tests
// This ensures all tests have consistent mocking for the appwrite SDK
vi.mock("appwrite", () => ({
    ID: {
        unique: () => "mock-id-123",
    },
    Query: {
        limit: (n: number) => `limit(${n})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
        cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
        equal: (field: string, value: string) => `equal(${field},${value})`,
        and: (...queries: string[]) => `and(${queries.join(",")})`,
        or: (...queries: string[]) => `or(${queries.join(",")})`,
        isNull: (field: string) => `isNull(${field})`,
        isNotNull: (field: string) => `isNotNull(${field})`,
        search: (field: string, value: string) => `search(${field},${value})`,
        contains: (field: string, value: string | string[]) =>
            `contains(${field},${JSON.stringify(Array.isArray(value) ? value : [value])})`,
    },
    Permission: {
        read: (role: string) => `read("${role}")`,
        write: (role: string) => `write("${role}")`,
        update: (role: string) => `update("${role}")`,
        delete: (role: string) => `delete("${role}")`,
        create: (role: string) => `create("${role}")`,
    },
    Role: {
        any: () => "any",
        user: (id: string) => `user:${id}`,
        users: () => "users",
        guests: () => "guests",
        team: (id: string, role?: string) =>
            role ? `team:${id}/${role}` : `team:${id}`,
    },
    Client: vi.fn(() => ({
        setEndpoint: vi.fn().mockReturnThis(),
        setProject: vi.fn().mockReturnThis(),
    })),
    Account: vi.fn(),
    Databases: vi.fn(),
    Storage: vi.fn(),
    Teams: vi.fn(),
    Channel: {
        database: (databaseId: string) => ({
            collection: (collectionId: string) => ({
                document: () => ({
                    toString: () =>
                        `databases.${databaseId}.collections.${collectionId}.documents`,
                }),
            }),
        }),
        bucket: (bucketId: string) => ({
            file: () => ({
                create: () => ({
                    toString: () => `buckets.${bucketId}.files.*.create`,
                }),
                toString: () => `buckets.${bucketId}.files`,
            }),
        }),
        files: () => ({
            toString: () => "files",
        }),
    },
    Realtime: vi.fn().mockImplementation(() => ({
        activeSubscriptions: new Map(),
        closeSocket: vi.fn().mockResolvedValue(undefined),
        reconnect: false,
        subscribe: vi.fn().mockResolvedValue({
            close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
    })),
}));

// Mock node-appwrite to prevent import errors
vi.mock("node-appwrite", () => ({
    Client: vi.fn(() => ({
        setEndpoint: vi.fn().mockReturnThis(),
        setProject: vi.fn().mockReturnThis(),
        setKey: vi.fn().mockReturnThis(),
    })),
    Databases: vi.fn(),
    TablesDB: vi.fn(() => ({
        createTransaction: vi.fn().mockResolvedValue({ $id: "mock-tx-id" }),
        getRow: vi
            .fn()
            .mockResolvedValue({ $id: "mock-row", status: "pending" }),
        updateRow: vi.fn().mockResolvedValue({}),
        updateTransaction: vi.fn().mockResolvedValue({}),
    })),
    Storage: vi.fn(),
    Teams: vi.fn(),
    AppwriteException: class AppwriteException extends Error {
        code: number;
        type: string;
        constructor(message: string, code = 500, type = "unknown") {
            super(message);
            this.code = code;
            this.type = type;
        }
    },
    Query: {
        // node-appwrite query strings include quoted JSON payloads in tests,
        // so keep JSON.stringify here to mirror server SDK behavior.
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${JSON.stringify(value)})`,
        limit: (n: number) => `limit(${n})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
        orderDesc: (field: string) => `orderDesc(${field})`,
        cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
        and: (...queries: string[]) => `and(${queries.join(",")})`,
        or: (...queries: string[]) => `or(${queries.join(",")})`,
        isNull: (field: string) => `isNull(${field})`,
        isNotNull: (field: string) => `isNotNull(${field})`,
        search: (field: string, value: string) => `search(${field},${value})`,
        contains: (field: string, value: string | string[]) =>
            `contains(${field},${JSON.stringify(Array.isArray(value) ? value : [value])})`,
        greaterThanEqual: (field: string, value: string) =>
            `greaterThanEqual(${field},${value})`,
    },
    Permission: {
        read: (role: string) => `read("${role}")`,
        write: (role: string) => `write("${role}")`,
        update: (role: string) => `update("${role}")`,
        delete: (role: string) => `delete("${role}")`,
        create: (role: string) => `create("${role}")`,
    },
    Role: {
        any: () => "any",
        user: (id: string) => `user:${id}`,
        users: () => "users",
        guests: () => "guests",
        team: (id: string, role?: string) =>
            role ? `team:${id}/${role}` : `team:${id}`,
    },
    ID: {
        unique: () => "mock-id-123",
    },
}));
