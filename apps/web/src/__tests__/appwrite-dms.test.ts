import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Models } from "appwrite";

let listDocumentsOverride:
    | ((params: {
          databaseId: string;
          collectionId: string;
          queries?: string[];
      }) => Promise<{ documents: Models.Document[]; total?: number }>)
    | null = null;
let updateDocumentOverride:
    | ((params: {
          databaseId: string;
          collectionId: string;
          documentId: string;
          data?: Record<string, unknown>;
      }) => Promise<unknown>)
    | null = null;
const mockDocuments: Record<string, Models.Document[]> = {};
const QUERY_VALUE_SEPARATOR = "|||";
let uniqueCounter = 0;

const EQUAL_PATTERN_QUOTED = /^equal\("([A-Za-z0-9_.$-]+)","(.*)"\)$/;
const EQUAL_PATTERN_UNQUOTED = /^equal\(([A-Za-z0-9_.$-]+),"(.*)"\)$/;
const CONTAINS_PATTERN_QUOTED = /^contains\("([A-Za-z0-9_.$-]+)","(.*)"\)$/;
const CONTAINS_PATTERN_UNQUOTED = /^contains\(([A-Za-z0-9_.$-]+),"(.*)"\)$/;
const CONTAINS_ARRAY_PATTERN_QUOTED =
    /^contains\("([A-Za-z0-9_.$-]+)",(\[.*\])\)$/;
const CONTAINS_ARRAY_PATTERN_UNQUOTED =
    /^contains\(([A-Za-z0-9_.$-]+),(\[.*\])\)$/;
const ORDER_DESC_PATTERN_QUOTED = /^orderDesc\("([A-Za-z0-9_.$-]+)"\)$/;
const ORDER_DESC_PATTERN_UNQUOTED = /^orderDesc\(([A-Za-z0-9_.$-]+)\)$/;
const CURSOR_AFTER_PATTERN_QUOTED = /^cursorAfter\("([A-Za-z0-9_.$-]+)"\)$/;
const CURSOR_AFTER_PATTERN_UNQUOTED = /^cursorAfter\(([A-Za-z0-9_.$-]+)\)$/;
const LIMIT_PATTERN = /^limit\((\d+)\)$/;
const SELECT_PATTERN = /^select\((\[.*\])\)$/;
const REGEX_SPECIAL_CHAR_PATTERN = /[.*+?^${}()|[\]\\]/g;

function parseQueryValues(rawValue: string): string[] {
    if (rawValue.includes(QUERY_VALUE_SEPARATOR)) {
        return rawValue.split(QUERY_VALUE_SEPARATOR).filter(Boolean);
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (typeof parsed === "string") {
            return [parsed];
        }
        if (
            Array.isArray(parsed) &&
            parsed.every((item) => typeof item === "string")
        ) {
            return parsed;
        }
        return [rawValue];
    } catch {
        return [rawValue];
    }
}

function escapeRegExp(value: string): string {
    return value.replace(REGEX_SPECIAL_CHAR_PATTERN, "\\$&");
}

// Mock environment variables
beforeEach(() => {
    process.env.APPWRITE_ENDPOINT = "http://localhost";
    process.env.APPWRITE_PROJECT_ID = "test-project";
    process.env.APPWRITE_DATABASE_ID = "main";
    process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = "conversations";
    process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID = "direct_messages";
    listDocumentsOverride = null;
    updateDocumentOverride = null;
    uniqueCounter = 0;
    for (const key of Object.keys(mockDocuments)) {
        delete mockDocuments[key];
    }
});

// Mock Appwrite
vi.mock("appwrite", () => {
    class MockDatabases {
        async listDocuments(params: {
            databaseId: string;
            collectionId: string;
            queries?: string[];
        }) {
            if (listDocumentsOverride) {
                return listDocumentsOverride(params);
            }
            const docs = [...(mockDocuments[params.collectionId] || [])];

            const queries = params.queries || [];
            const equalQueries = queries.filter(
                (query) =>
                    EQUAL_PATTERN_QUOTED.test(query) ||
                    EQUAL_PATTERN_UNQUOTED.test(query),
            );
            const containsQueries = queries.filter(
                (query) =>
                    CONTAINS_PATTERN_QUOTED.test(query) ||
                    CONTAINS_PATTERN_UNQUOTED.test(query) ||
                    CONTAINS_ARRAY_PATTERN_QUOTED.test(query) ||
                    CONTAINS_ARRAY_PATTERN_UNQUOTED.test(query),
            );
            const orderDescQuery = queries.find(
                (query) =>
                    ORDER_DESC_PATTERN_QUOTED.test(query) ||
                    ORDER_DESC_PATTERN_UNQUOTED.test(query),
            );
            const cursorQuery = queries.find(
                (query) =>
                    CURSOR_AFTER_PATTERN_QUOTED.test(query) ||
                    CURSOR_AFTER_PATTERN_UNQUOTED.test(query),
            );
            const limitQuery = queries.find((query) =>
                LIMIT_PATTERN.test(query),
            );
            const selectQuery = queries.find((query) =>
                SELECT_PATTERN.test(query),
            );

            const filtered = equalQueries.reduce((currentDocs, query) => {
                const equalMatch =
                    EQUAL_PATTERN_QUOTED.exec(query) ||
                    EQUAL_PATTERN_UNQUOTED.exec(query);
                if (!equalMatch) {
                    return currentDocs;
                }

                const [, field, rawValue] = equalMatch;
                const values = rawValue
                    .split(QUERY_VALUE_SEPARATOR)
                    .filter(Boolean);

                return currentDocs.filter((doc) => {
                    const value = (doc as Record<string, unknown>)[field];
                    if (Array.isArray(value)) {
                        return value.some((item) =>
                            values.includes(String(item)),
                        );
                    }

                    return values.includes(String(value ?? ""));
                });
            }, docs);

            const containsFiltered = containsQueries.reduce(
                (currentDocs, query) => {
                    const quotedContainsMatch =
                        CONTAINS_PATTERN_QUOTED.exec(query) ||
                        CONTAINS_PATTERN_UNQUOTED.exec(query);
                    const arrayContainsMatch =
                        CONTAINS_ARRAY_PATTERN_QUOTED.exec(query) ||
                        CONTAINS_ARRAY_PATTERN_UNQUOTED.exec(query);

                    const field =
                        quotedContainsMatch?.[1] ?? arrayContainsMatch?.[1];
                    const rawValue =
                        quotedContainsMatch?.[2] ?? arrayContainsMatch?.[2];

                    if (!field || !rawValue) {
                        return currentDocs;
                    }

                    const values = parseQueryValues(rawValue);
                    const patterns = values.map(
                        (value) => new RegExp(escapeRegExp(value), "i"),
                    );

                    return currentDocs.filter((doc) => {
                        const value = (doc as Record<string, unknown>)[field];
                        if (Array.isArray(value)) {
                            return value.some((item) =>
                                patterns.some((pattern) =>
                                    pattern.test(String(item)),
                                ),
                            );
                        }

                        return patterns.some((pattern) =>
                            pattern.test(String(value ?? "")),
                        );
                    });
                },
                filtered,
            );

            const sorted = (() => {
                if (!orderDescQuery) {
                    return containsFiltered;
                }

                const orderDescMatch =
                    ORDER_DESC_PATTERN_QUOTED.exec(orderDescQuery) ||
                    ORDER_DESC_PATTERN_UNQUOTED.exec(orderDescQuery);
                if (!orderDescMatch) {
                    return containsFiltered;
                }

                const [, field] = orderDescMatch;
                return [...containsFiltered].sort((left, right) => {
                    const leftValue = String(
                        (left as Record<string, unknown>)[field] ??
                            left.$createdAt ??
                            left.$id,
                    );
                    const rightValue = String(
                        (right as Record<string, unknown>)[field] ??
                            right.$createdAt ??
                            right.$id,
                    );
                    return rightValue.localeCompare(leftValue);
                });
            })();

            const afterCursor = (() => {
                if (!cursorQuery) {
                    return sorted;
                }

                const cursorMatch =
                    CURSOR_AFTER_PATTERN_QUOTED.exec(cursorQuery) ||
                    CURSOR_AFTER_PATTERN_UNQUOTED.exec(cursorQuery);
                if (!cursorMatch) {
                    return sorted;
                }

                const [, cursorId] = cursorMatch;
                const cursorIndex = sorted.findIndex(
                    (doc) => doc.$id === cursorId,
                );
                return cursorIndex >= 0
                    ? sorted.slice(cursorIndex + 1)
                    : sorted;
            })();

            const limited = (() => {
                if (!limitQuery) {
                    return afterCursor;
                }

                const limitMatch = LIMIT_PATTERN.exec(limitQuery);
                if (!limitMatch) {
                    return afterCursor;
                }

                const [, rawLimit] = limitMatch;
                const parsedLimit = Number.parseInt(rawLimit, 10);
                return afterCursor.slice(0, parsedLimit);
            })();

            const projected = (() => {
                if (!selectQuery) {
                    return limited;
                }

                const selectMatch = SELECT_PATTERN.exec(selectQuery);
                if (!selectMatch) {
                    return limited;
                }

                try {
                    const parsedFields = JSON.parse(selectMatch[1]) as unknown;
                    if (
                        !Array.isArray(parsedFields) ||
                        !parsedFields.every((field) => typeof field === "string")
                    ) {
                        return limited;
                    }

                    return limited.map((doc) => {
                        const source = doc as Record<string, unknown>;
                        const selected: Record<string, unknown> = {
                            $id: source.$id,
                        };

                        for (const field of parsedFields) {
                            if (field in source) {
                                selected[field] = source[field];
                            }
                        }

                        return selected as Models.Document;
                    });
                } catch {
                    return limited;
                }
            })();

            return {
                documents: projected,
                total: projected.length,
            };
        }

        async createDocument(params: {
            databaseId: string;
            collectionId: string;
            documentId: string;
            data: Record<string, unknown>;
            permissions?: string[];
        }) {
            const doc = {
                $id: params.documentId,
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: params.permissions || [],
                ...params.data,
            } as Models.Document;

            if (!mockDocuments[params.collectionId]) {
                mockDocuments[params.collectionId] = [];
            }
            mockDocuments[params.collectionId].push(doc);
            return doc;
        }

        async updateDocument(params: {
            databaseId: string;
            collectionId: string;
            documentId: string;
            data?: Record<string, unknown>;
        }) {
            if (updateDocumentOverride) {
                return updateDocumentOverride(params);
            }
            const docs = mockDocuments[params.collectionId] || [];
            const doc = docs.find((d) => d.$id === params.documentId);
            if (!doc) {
                throw new Error("Document not found");
            }
            Object.assign(doc, params.data);
            doc.$updatedAt = new Date().toISOString();
            return doc;
        }

        async getDocument(params: {
            databaseId: string;
            collectionId: string;
            documentId: string;
        }) {
            const docs = mockDocuments[params.collectionId] || [];
            const doc = docs.find((d) => d.$id === params.documentId);
            if (!doc) {
                throw new Error("Document not found");
            }
            return doc;
        }
    }

    class MockClient {
        setEndpoint() {
            return this;
        }
        setProject() {
            return this;
        }
    }

    return {
        Client: MockClient,
        Databases: MockDatabases,
        ID: {
            unique: () => {
                uniqueCounter += 1;
                return `test-${Date.now()}-${uniqueCounter}`;
            },
        },
        Query: {
            equal: (attr: string, val: string | string[]) =>
                `equal("${attr}","${Array.isArray(val) ? val.join(QUERY_VALUE_SEPARATOR) : val}")`,
            contains: (attr: string, val: string | string[]) =>
                `contains("${attr}",${JSON.stringify(Array.isArray(val) ? val : [val])})`,
            select: (attrs: string[]) => `select(${JSON.stringify(attrs)})`,
            orderDesc: (attr: string) => `orderDesc("${attr}")`,
            limit: (num: number) => `limit(${num})`,
            cursorAfter: (id: string) => `cursorAfter("${id}")`,
        },
        Permission: {
            read: (role: string) => `read("${role}")`,
            update: (role: string) => `update("${role}")`,
            delete: (role: string) => `delete("${role}")`,
        },
        Role: {
            user: (id: string) => `user:${id}`,
        },
    };
});

describe("Direct Messages - Core Functions", () => {
    it("should export DM functions", async () => {
        const mod = await import("../lib/appwrite-dms");
        expect(typeof mod.getOrCreateConversation).toBe("function");
        expect(typeof mod.listConversations).toBe("function");
        expect(typeof mod.sendDirectMessage).toBe("function");
        expect(typeof mod.listDirectMessages).toBe("function");
        expect(typeof mod.editDirectMessage).toBe("function");
        expect(typeof mod.deleteDirectMessage).toBe("function");
    });

    it("should create conversation with sorted participants", async () => {
        const { getOrCreateConversation } = await import("../lib/appwrite-dms");

        const conversation = await getOrCreateConversation("user2", "user1");

        expect(conversation).toBeDefined();
        expect(conversation.$id).toBeDefined();
        expect(Array.isArray(conversation.participants)).toBe(true);
        // Should be sorted alphabetically
        expect(conversation.participants[0]).toBe("user1");
        expect(conversation.participants[1]).toBe("user2");
    });

    it("should send direct message with correct structure", async () => {
        const { sendDirectMessage } = await import("../lib/appwrite-dms");

        const message = await sendDirectMessage(
            "conv123",
            "user1",
            "user2",
            "Hello!",
        );

        expect(message).toBeDefined();
        expect(message.$id).toBeDefined();
        expect(message.conversationId).toBe("conv123");
        expect(message.senderId).toBe("user1");
        expect(message.receiverId).toBe("user2");
        expect(message.text).toBe("Hello!");
    });

    it("should edit direct message", async () => {
        const { sendDirectMessage, editDirectMessage } =
            await import("../lib/appwrite-dms");

        const message = await sendDirectMessage(
            "conv123",
            "user1",
            "user2",
            "Original",
        );

        // editDirectMessage returns void, just verify it doesn't throw
        await expect(
            editDirectMessage(message.$id, "Edited"),
        ).resolves.toBeUndefined();
    });

    it("should soft delete direct message", async () => {
        const { sendDirectMessage, deleteDirectMessage } =
            await import("../lib/appwrite-dms");

        const message = await sendDirectMessage(
            "conv123",
            "user1",
            "user2",
            "Test",
        );

        // deleteDirectMessage returns void, just verify it doesn't throw
        await expect(
            deleteDirectMessage(message.$id, "user1"),
        ).resolves.toBeUndefined();
    });

    it("should get or create existing conversation", async () => {
        const { getOrCreateConversation } = await import("../lib/appwrite-dms");

        // Create first conversation
        const conv1 = await getOrCreateConversation("user3", "user4");
        expect(conv1).toHaveProperty("$id");

        // Getting the same conversation should return same structure
        const conv2 = await getOrCreateConversation("user4", "user3");
        expect(conv2).toHaveProperty("$id");
        expect(conv2.$id).toBe(conv1.$id);
        expect(conv2.participants).toEqual(conv1.participants);
    });

    it("should list conversations for a user", async () => {
        const { getOrCreateConversation, listConversations } =
            await import("../lib/appwrite-dms");

        await getOrCreateConversation("user1", "user2");
        await getOrCreateConversation("user1", "user3");

        const conversations = await listConversations("user1");

        expect(Array.isArray(conversations)).toBe(true);
        expect(conversations.length).toBeGreaterThan(0);
    });

    it("should list direct messages for a conversation", async () => {
        const { sendDirectMessage, listDirectMessages } =
            await import("../lib/appwrite-dms");

        await sendDirectMessage("conv123", "user1", "user2", "Message 1");
        await sendDirectMessage("conv123", "user2", "user1", "Message 2");

        const result = await listDirectMessages("conv123", 50);

        expect(result).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items).toHaveLength(2);
        expect(
            result.items.some(
                (item) =>
                    item.text === "Message 1" && item.senderId === "user1",
            ),
        ).toBe(true);
        expect(
            result.items.some(
                (item) =>
                    item.text === "Message 2" && item.senderId === "user2",
            ),
        ).toBe(true);
    });
});

describe("Direct Messages - Query.contains Mock", () => {
    beforeEach(() => {
        mockDocuments.contains_fixture = [
            {
                $id: "contains-1",
                $createdAt: "2026-03-10T10:00:00.000Z",
                displayName: "Alice Wonder",
                tags: ["Core-Team", "Frontend"],
            } as Models.Document,
            {
                $id: "contains-2",
                $createdAt: "2026-03-10T10:01:00.000Z",
                displayName: "Bob Builder",
                tags: ["Backend", "Support"],
            } as Models.Document,
            {
                $id: "contains-3",
                $createdAt: "2026-03-10T10:02:00.000Z",
                displayName: "Charlie Ops",
                tags: ["QA", "Operations"],
            } as Models.Document,
        ];
    });

    it("matches contains with single string value using case-insensitive substring", async () => {
        const { Databases, Query } = await import("appwrite");
        const databases = new Databases();

        const result = await databases.listDocuments({
            databaseId: "main",
            collectionId: "contains_fixture",
            queries: [Query.contains("displayName", "ali")],
        });

        expect(result.documents.map((doc) => doc.$id)).toEqual(["contains-1"]);
    });

    it("matches contains with multiple values for array fields", async () => {
        const { Databases, Query } = await import("appwrite");
        const databases = new Databases();

        const result = await databases.listDocuments({
            databaseId: "main",
            collectionId: "contains_fixture",
            queries: [Query.contains("tags", ["front", "support"])],
        });

        expect(result.documents.map((doc) => doc.$id)).toEqual([
            "contains-1",
            "contains-2",
        ]);
    });

    it("returns no documents when contains values do not match", async () => {
        const { Databases, Query } = await import("appwrite");
        const databases = new Databases();

        const result = await databases.listDocuments({
            databaseId: "main",
            collectionId: "contains_fixture",
            queries: [Query.contains("displayName", ["zzz"])],
        });

        expect(result.documents).toHaveLength(0);
    });
});

describe("Direct Messages - Permission Handling", () => {
    it("should create conversation successfully", async () => {
        const { getOrCreateConversation } = await import("../lib/appwrite-dms");

        const conversation = await getOrCreateConversation("user1", "user2");

        // Verify conversation structure
        expect(conversation.$id).toBeDefined();
        expect(conversation.participants).toEqual(
            expect.arrayContaining(["user1", "user2"]),
        );
        expect(conversation.$permissions).toEqual(
            expect.arrayContaining([
                'read("user:user1")',
                'read("user:user2")',
                'update("user:user1")',
                'update("user:user2")',
            ]),
        );
    });

    it("should create direct message successfully", async () => {
        const { sendDirectMessage } = await import("../lib/appwrite-dms");

        const message = await sendDirectMessage(
            "conv123",
            "user1",
            "user2",
            "Test",
        );

        // Verify message structure
        expect(message.$id).toBeDefined();
        expect(message.senderId).toBe("user1");
        expect(message.receiverId).toBe("user2");
        expect(message.text).toBe("Test");
        expect(message.$permissions).toEqual(
            expect.arrayContaining([
                'read("user:user1")',
                'read("user:user2")',
                'update("user:user1")',
                'delete("user:user1")',
            ]),
        );
    });
});

describe("Direct Messages - Edge Cases", () => {
    it("should allow empty message text (no validation)", async () => {
        const { sendDirectMessage } = await import("../lib/appwrite-dms");

        // The function doesn't validate empty text
        const message = await sendDirectMessage(
            "conv123",
            "user1",
            "user2",
            "",
        );

        expect(message).toHaveProperty("$id");
        expect(message.text).toBe("");
    });

    it("should filter messages by conversation ID", async () => {
        const { listDirectMessages } = await import("../lib/appwrite-dms");

        mockDocuments.direct_messages = [
            {
                $id: "dm-1",
                $createdAt: "2026-03-10T12:00:00.000Z",
                conversationId: "conv123",
                receiverId: "user2",
                senderId: "user1",
                text: "Match 1",
            } as Models.Document,
            {
                $id: "dm-2",
                $createdAt: "2026-03-10T12:01:00.000Z",
                conversationId: "conv123",
                receiverId: "user1",
                senderId: "user2",
                text: "Match 2",
            } as Models.Document,
            {
                $id: "dm-3",
                $createdAt: "2026-03-10T12:02:00.000Z",
                conversationId: "conv-other",
                receiverId: "user9",
                senderId: "user8",
                text: "Non match",
            } as Models.Document,
        ];

        const result = await listDirectMessages("conv123", 50);

        expect(result.items).toHaveLength(2);
        for (const msg of result.items) {
            expect(msg.conversationId).toBe("conv123");
        }
        expect(
            result.items.some((item) => item.conversationId === "conv-other"),
        ).toBe(false);
    });

    it("should handle pagination cursor", async () => {
        const { listDirectMessages } = await import("../lib/appwrite-dms");

        mockDocuments.direct_messages = [
            {
                $id: "cursor123",
                $createdAt: "2026-03-10T12:02:00.000Z",
                conversationId: "conv123",
                receiverId: "user2",
                senderId: "user1",
                text: "Newest",
            } as Models.Document,
            {
                $id: "dm-after-1",
                $createdAt: "2026-03-10T12:01:00.000Z",
                conversationId: "conv123",
                receiverId: "user1",
                senderId: "user2",
                text: "After cursor 1",
            } as Models.Document,
            {
                $id: "dm-after-2",
                $createdAt: "2026-03-10T12:00:00.000Z",
                conversationId: "conv123",
                receiverId: "user2",
                senderId: "user1",
                text: "After cursor 2",
            } as Models.Document,
        ];

        const result = await listDirectMessages("conv123", 10, "cursor123");

        expect(result.items.map((item) => item.$id)).toEqual([
            "dm-after-1",
            "dm-after-2",
        ]);
        expect(result.nextCursor).toBeUndefined();
    });

    it("should normalize and migrate legacy DM reaction maps", async () => {
        const updateDocument = vi.fn(() => Promise.resolve({ $id: "dm-1" }));
        listDocumentsOverride = async (params) => {
            if (params.collectionId === "direct_messages") {
                return {
                    documents: [
                        {
                            $id: "dm-1",
                            conversationId: "conv123",
                            senderId: "user1",
                            receiverId: "user2",
                            text: "hello",
                            reactions: { "🔥": ["user1"] },
                            $createdAt: new Date().toISOString(),
                        } as Models.Document,
                    ],
                };
            }

            return { documents: [], total: 0 };
        };
        updateDocumentOverride = async (params) => updateDocument(params);

        const { listDirectMessages } = await import("../lib/appwrite-dms");
        const result = await listDirectMessages("conv123", 50);

        expect(result.items[0]?.reactions).toEqual([
            { emoji: "🔥", userIds: ["user1"], count: 1 },
        ]);
        expect(updateDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionId: "direct_messages",
                data: expect.objectContaining({
                    reactions: expect.any(String),
                }),
                documentId: "dm-1",
            }),
        );

        const updatePayload = updateDocument.mock.calls[0]?.[0] as {
            data?: { reactions?: string };
        };
        const normalizedReactions = JSON.parse(
            updatePayload.data?.reactions ?? "[]",
        ) as Array<{ emoji: string; userIds: string[]; count: number }>;
        expect(normalizedReactions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    count: 1,
                    emoji: "🔥",
                    userIds: ["user1"],
                }),
            ]),
        );
    });
});

describe("Direct Messages - Data Enrichment", () => {
    it("should enrich conversations with other user data", async () => {
        const { getOrCreateConversation, listConversations } =
            await import("../lib/appwrite-dms");

        await getOrCreateConversation("user1", "user2");
        const conversations = await listConversations("user1");

        expect(conversations.length).toBeGreaterThan(0);
        const conv = conversations[0];
        expect(conv.otherUser).toBeDefined();
    });

    it("should enrich messages with sender data", async () => {
        const { sendDirectMessage, listDirectMessages } =
            await import("../lib/appwrite-dms");

        await sendDirectMessage("conv123", "user1", "user2", "Test message");
        const result = await listDirectMessages("conv123", 50);

        expect(result.items).not.toHaveLength(0);
        const message = result.items[0];
        // Sender data should be attempted to be enriched
        expect(message.senderId).toBe("user1");
    });
});

describe("Direct Messages - Group Conversations", () => {
    it("should require at least three participants", async () => {
        const { createGroupConversation } = await import("../lib/appwrite-dms");

        await expect(
            createGroupConversation(["user1", "user2"], { name: "Too small" }),
        ).rejects.toThrow(
            "Group conversations require at least 3 participants",
        );
    });

    it("should create group conversations with unique sorted participants", async () => {
        const { createGroupConversation } = await import("../lib/appwrite-dms");

        const conversation = await createGroupConversation(
            ["user3", "user2", "user2", "user1"],
            { name: "Group name", avatarUrl: "http://example.com/avatar.png" },
        );

        expect(conversation.isGroup).toBe(true);
        expect(conversation.participantCount).toBe(3);
        expect(conversation.participants).toEqual(["user1", "user2", "user3"]);
        expect(conversation.name).toBe("Group name");
        expect(conversation.avatarUrl).toBe("http://example.com/avatar.png");
    });

    it("should send messages to group conversations without a receiverId", async () => {
        const { createGroupConversation, sendDirectMessage } =
            await import("../lib/appwrite-dms");

        const conversation = await createGroupConversation(
            ["alpha", "beta", "gamma"],
            { name: "Group chat" },
        );

        const message = await sendDirectMessage(
            conversation.$id,
            "alpha",
            undefined,
            "Hello group",
        );

        expect(message.conversationId).toBe(conversation.$id);
        expect(message.senderId).toBe("alpha");
        expect(message.receiverId).toBeUndefined();
        expect(message.text).toBe("Hello group");
    });
});
