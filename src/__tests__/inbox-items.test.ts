import { beforeEach, describe, expect, it, vi } from "vitest";

import { upsertMentionInboxItems } from "@/lib/inbox-items";

const { mockCreateDocument, mockListDocuments, mockUpdateDocument } =
    vi.hoisted(() => ({
        mockCreateDocument: vi.fn(),
        mockListDocuments: vi.fn(),
        mockUpdateDocument: vi.fn(),
    }));

vi.mock("node-appwrite", () => ({
    ID: {
        unique: vi.fn(() => "generated-id"),
    },
    Query: {
        equal: (field: string, value: string) => `equal(${field},${value})`,
        limit: (value: number) => `limit(${value})`,
    },
}));

vi.mock("@/lib/appwrite-admin", () => ({
    getAdminClient: vi.fn(() => ({
        databases: {
            createDocument: mockCreateDocument,
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
        },
    })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        databaseId: "test-db",
        collections: {
            inboxItems: "inbox-items-collection",
        },
    })),
    perms: {
        serverOwner: vi.fn((userId: string) => [`read(${userId})`]),
    },
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    resolveProfileIdentifiers: vi.fn(
        async () =>
            new Map([
                ["alice", "user-2"],
                ["bob", "user-3"],
            ]),
    ),
}));

describe("inbox-items", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates mention inbox items for resolved mention targets", async () => {
        mockListDocuments.mockResolvedValue({ documents: [] });

        await upsertMentionInboxItems({
            authorUserId: "user-1",
            contextId: "channel-1",
            contextKind: "channel",
            latestActivityAt: "2026-03-11T12:00:00.000Z",
            mentions: ["alice", "alice", "bob", "user-1"],
            messageId: "message-1",
            previewText: "Hello @alice and @bob",
            serverId: "server-1",
        });

        expect(mockCreateDocument).toHaveBeenCalledTimes(2);
        expect(mockCreateDocument).toHaveBeenCalledWith(
            "test-db",
            "inbox-items-collection",
            "generated-id",
            expect.objectContaining({
                authorUserId: "user-1",
                contextId: "channel-1",
                contextKind: "channel",
                kind: "mention",
                messageId: "message-1",
                previewText: "Hello @alice and @bob",
                serverId: "server-1",
            }),
            ["read(user-2)"],
        );
    });

    it("updates an existing mention inbox item instead of creating a duplicate", async () => {
        mockListDocuments.mockResolvedValue({
            documents: [{ $id: "existing-item" }],
        });

        await upsertMentionInboxItems({
            authorUserId: "user-1",
            contextId: "conv-1",
            contextKind: "conversation",
            latestActivityAt: "2026-03-11T12:00:00.000Z",
            mentions: ["alice"],
            messageId: "message-1",
            previewText: "Hi @alice",
        });

        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "test-db",
            "inbox-items-collection",
            "existing-item",
            expect.objectContaining({
                contextKind: "conversation",
                contextId: "conv-1",
                kind: "mention",
                messageId: "message-1",
                previewText: "Hi @alice",
                userId: "user-2",
            }),
        );
        expect(mockCreateDocument).not.toHaveBeenCalled();
    });
});
