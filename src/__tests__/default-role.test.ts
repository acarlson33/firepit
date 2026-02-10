import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Databases } from "node-appwrite";

type ListDocuments = (
    databaseId: string,
    collectionId: string,
    queries?: unknown[],
) => Promise<{ documents: Array<Record<string, unknown>> }>;

type CreateDocument = (
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type UpdateDocument = (
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>,
) => Promise<unknown>;

let databasesStub: Databases;
let listDocuments: ReturnType<typeof vi.fn<ListDocuments>>;
let createDocument: ReturnType<typeof vi.fn<CreateDocument>>;
let updateDocument: ReturnType<typeof vi.fn<UpdateDocument>>;

vi.mock("node-appwrite", () => ({
    ID: {
        unique: vi.fn(() => "role-assignment-id"),
    },
    Query: {
        equal: (...args: unknown[]) => ({ type: "equal", args }),
        orderDesc: (field: string) => ({ type: "orderDesc", field }),
        limit: (value: number) => ({ type: "limit", value }),
    },
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "main",
        endpoint: "https://example.test",
        project: "project-id",
    })),
    getBrowserDatabases: vi.fn(() => databasesStub),
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({ databases: databasesStub })),
}));

const modulePromise = import("@/lib/default-role");

describe("default-role", () => {
    beforeEach(() => {
        listDocuments = vi.fn<ListDocuments>();
        createDocument = vi.fn<CreateDocument>();
        updateDocument = vi.fn<UpdateDocument>();
        databasesStub = {
            listDocuments,
            createDocument,
            updateDocument,
        } as unknown as Databases;
    });

    it("assigns the default role to a new member and updates counts", async () => {
        const defaultRole = {
            $id: "role-1",
            serverId: "server-1",
            defaultOnJoin: true,
            position: 5,
        };

        listDocuments
            .mockResolvedValueOnce({ documents: [defaultRole] })
            .mockResolvedValueOnce({ documents: [] })
            .mockResolvedValueOnce({
                documents: [{ $id: "assignment-1", roleIds: ["role-1"] }],
            });

        createDocument.mockResolvedValue({ $id: "assignment-1" });
        updateDocument.mockResolvedValue({});

        const { assignDefaultRoleServer } = await modulePromise;
        const applied = await assignDefaultRoleServer("server-1", "user-1");

        expect(applied).toBe(true);
        expect(createDocument).toHaveBeenCalledWith(
            "main",
            "role_assignments",
            "role-assignment-id",
            { serverId: "server-1", userId: "user-1", roleIds: ["role-1"] },
        );
        expect(updateDocument).toHaveBeenCalledWith(
            "main",
            "roles",
            "role-1",
            { memberCount: 1 },
        );
    });

    it("skips assignment when member already has the default role", async () => {
        const defaultRole = {
            $id: "role-1",
            serverId: "server-1",
            defaultOnJoin: true,
            position: 5,
        };

        listDocuments
            .mockResolvedValueOnce({ documents: [defaultRole] })
            .mockResolvedValueOnce({
                documents: [{ $id: "assignment-1", roleIds: ["role-1"] }],
            });

        const { assignDefaultRoleServer } = await modulePromise;
        const applied = await assignDefaultRoleServer("server-1", "user-1");

        expect(applied).toBe(true);
        expect(createDocument).not.toHaveBeenCalled();
        expect(updateDocument).not.toHaveBeenCalled();
    });

    it("disables other defaults when enforcing a single default role", async () => {
        listDocuments.mockResolvedValue({
            documents: [
                { $id: "keep", serverId: "server-1", defaultOnJoin: true },
                { $id: "remove", serverId: "server-1", defaultOnJoin: true },
            ],
        });
        updateDocument.mockResolvedValue({});

        const { enforceSingleDefaultRole } = await modulePromise;
        await enforceSingleDefaultRole(databasesStub, "main", "server-1", "keep");

        expect(updateDocument).toHaveBeenCalledTimes(1);
        expect(updateDocument).toHaveBeenCalledWith("main", "roles", "remove", {
            defaultOnJoin: false,
        });
    });
});
