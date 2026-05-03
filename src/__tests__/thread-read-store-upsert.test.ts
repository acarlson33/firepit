import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appwrite-admin", () => ({
    getAdminClient: () => ({
        databases: {
            createDocument: mockCreateDocument,
            listDocuments: mockListDocuments,
            updateDocument: mockUpdateDocument,
            getDocument: mockGetDocument,
        },
    }),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: () => ({
        collections: {
            threadReads: "threadReads",
        },
        databaseId: "db",
    }),
    perms: {
        serverOwner: mockServerOwner,
    },
}));

const {
    mockCreateDocument,
    mockListDocuments,
    mockUpdateDocument,
    mockGetDocument,
    mockServerOwner,
} = vi.hoisted(() => ({
    mockCreateDocument: vi.fn(),
    mockListDocuments: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockGetDocument: vi.fn(),
    mockServerOwner: vi.fn(() => ["read:user:user-1"]),
}));

import { upsertThreadReads } from "../lib/thread-read-store";

describe("thread-read-store upsertThreadReads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("updates an existing thread-read document instead of creating a duplicate", async () => {
        mockListDocuments.mockResolvedValueOnce({
            documents: [
                {
                    $id: "existing-1",
                    contextId: "channel-1",
                    contextType: "channel",
                    reads: JSON.stringify({
                        "message-1": "2026-04-10T00:00:00.000Z",
                    }),
                    userId: "user-1",
                },
            ],
        });
        mockUpdateDocument.mockResolvedValueOnce({
            $id: "existing-1",
            contextId: "channel-1",
            contextType: "channel",
            reads: JSON.stringify({
                "message-1": "2026-04-10T02:00:00.000Z",
                "message-2": "2026-04-10T01:00:00.000Z",
            }),
            userId: "user-1",
        });

        const result = await upsertThreadReads({
            contextId: "channel-1",
            contextType: "channel",
            reads: {
                "message-1": "2026-04-10T02:00:00.000Z",
                "message-2": "2026-04-10T01:00:00.000Z",
            },
            userId: "user-1",
        });

        expect(mockCreateDocument).not.toHaveBeenCalled();
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "db",
            "threadReads",
            "existing-1",
            {
                reads: JSON.stringify({
                    "message-1": "2026-04-10T02:00:00.000Z",
                    "message-2": "2026-04-10T01:00:00.000Z",
                }),
            },
        );
        expect(result.reads).toEqual({
            "message-1": "2026-04-10T02:00:00.000Z",
            "message-2": "2026-04-10T01:00:00.000Z",
        });
    });

    it("recovers from create conflict by loading and updating the concurrent record", async () => {
        mockListDocuments
            .mockResolvedValueOnce({
                documents: [],
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        $id: "concurrent-1",
                        contextId: "channel-1",
                        contextType: "channel",
                        reads: JSON.stringify({
                            "message-1": "2026-04-10T00:30:00.000Z",
                        }),
                        userId: "user-1",
                    },
                ],
            });

        mockCreateDocument.mockRejectedValueOnce({
            code: 409,
            message:
                "Document with the requested ID '69d9767f0002fd84869b' already exists.",
        });

        mockUpdateDocument.mockResolvedValueOnce({
            $id: "concurrent-1",
            contextId: "channel-1",
            contextType: "channel",
            reads: JSON.stringify({
                "message-1": "2026-04-10T01:30:00.000Z",
            }),
            userId: "user-1",
        });

        const result = await upsertThreadReads({
            contextId: "channel-1",
            contextType: "channel",
            reads: {
                "message-1": "2026-04-10T01:30:00.000Z",
            },
            userId: "user-1",
        });

        expect(mockCreateDocument).toHaveBeenCalledTimes(1);
        expect(mockUpdateDocument).toHaveBeenCalledWith(
            "db",
            "threadReads",
            "concurrent-1",
            {
                reads: JSON.stringify({
                    "message-1": "2026-04-10T01:30:00.000Z",
                }),
            },
        );
        expect(result.$id).toBe("concurrent-1");
        expect(result.reads).toEqual({
            "message-1": "2026-04-10T01:30:00.000Z",
        });
    });
});
