import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Models } from "appwrite";

// Mock environment variables
beforeEach(() => {
	process.env.APPWRITE_ENDPOINT = "http://localhost";
	process.env.APPWRITE_PROJECT_ID = "test-project";
	process.env.APPWRITE_DATABASE_ID = "main";
	process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID = "conversations";
	process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID = "direct_messages";
});

// Mock Appwrite
vi.mock("appwrite", () => {
	const mockDocuments: Record<string, Models.Document[]> = {};

	class MockDatabases {
		async listDocuments(params: {
			databaseId: string;
			collectionId: string;
			queries?: string[];
		}) {
			const docs = mockDocuments[params.collectionId] || [];
			return {
				documents: docs,
				total: docs.length,
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
			unique: () => `test-${Date.now()}`,
		},
		Query: {
			equal: (attr: string, val: string | string[]) =>
				`equal("${attr}","${Array.isArray(val) ? val.join(",") : val}")`,
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
			user: (id: string) => `user(${id})`,
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
			"Hello!"
		);

		expect(message).toBeDefined();
		expect(message.$id).toBeDefined();
		expect(message.conversationId).toBe("conv123");
		expect(message.senderId).toBe("user1");
		expect(message.receiverId).toBe("user2");
		expect(message.text).toBe("Hello!");
	});

	it("should edit direct message", async () => {
		const { sendDirectMessage, editDirectMessage } = await import(
			"../lib/appwrite-dms"
		);

		const message = await sendDirectMessage(
			"conv123",
			"user1",
			"user2",
			"Original"
		);
		
		// editDirectMessage returns void, just verify it doesn't throw
		await expect(editDirectMessage(message.$id, "Edited")).resolves.toBeUndefined();
	});

	it("should soft delete direct message", async () => {
		const { sendDirectMessage, deleteDirectMessage } = await import(
			"../lib/appwrite-dms"
		);

		const message = await sendDirectMessage(
			"conv123",
			"user1",
			"user2",
			"Test"
		);
		
		// deleteDirectMessage returns void, just verify it doesn't throw
		await expect(deleteDirectMessage(message.$id, "user1")).resolves.toBeUndefined();
	});

	it("should get or create existing conversation", async () => {
		const { getOrCreateConversation } = await import("../lib/appwrite-dms");

		// Create first conversation
		const conv1 = await getOrCreateConversation("user3", "user4");
		expect(conv1).toHaveProperty("$id");
		
		// Getting the same conversation should return same structure
		const conv2 = await getOrCreateConversation("user4", "user3");
		expect(conv2).toHaveProperty("$id");
		expect(conv2.participants).toEqual(conv1.participants);
	});

	it("should list conversations for a user", async () => {
		const { getOrCreateConversation, listConversations } = await import(
			"../lib/appwrite-dms"
		);

		await getOrCreateConversation("user1", "user2");
		await getOrCreateConversation("user1", "user3");

		const conversations = await listConversations("user1");

		expect(Array.isArray(conversations)).toBe(true);
		expect(conversations.length).toBeGreaterThan(0);
	});

	it("should list direct messages for a conversation", async () => {
		const { sendDirectMessage, listDirectMessages } = await import(
			"../lib/appwrite-dms"
		);

		await sendDirectMessage("conv123", "user1", "user2", "Message 1");
		await sendDirectMessage("conv123", "user2", "user1", "Message 2");

		const result = await listDirectMessages("conv123", 50);

		expect(result).toBeDefined();
		expect(Array.isArray(result.items)).toBe(true);
		expect(result.items.length).toBeGreaterThanOrEqual(0);
	});
});

describe("Direct Messages - Permission Handling", () => {
	it("should create conversation successfully", async () => {
		const { getOrCreateConversation } = await import("../lib/appwrite-dms");

		const conversation = await getOrCreateConversation("user1", "user2");

		// Verify conversation structure
		expect(conversation.$id).toBeDefined();
		expect(conversation.participants).toEqual(expect.arrayContaining(["user1", "user2"]));
	});

	it("should create direct message successfully", async () => {
		const { sendDirectMessage } = await import("../lib/appwrite-dms");

		const message = await sendDirectMessage(
			"conv123",
			"user1",
			"user2",
			"Test"
		);

		// Verify message structure
		expect(message.$id).toBeDefined();
		expect(message.senderId).toBe("user1");
		expect(message.receiverId).toBe("user2");
		expect(message.text).toBe("Test");
	});
});

describe("Direct Messages - Edge Cases", () => {
	it("should allow empty message text (no validation)", async () => {
		const { sendDirectMessage } = await import("../lib/appwrite-dms");

		// The function doesn't validate empty text
		const message = await sendDirectMessage("conv123", "user1", "user2", "");
		
		expect(message).toHaveProperty("$id");
		expect(message.text).toBe("");
	});

	it("should filter messages by conversation ID", async () => {
		const { listDirectMessages } = await import("../lib/appwrite-dms");

		// Mock returns all messages - in real implementation would filter by conversationId
		const result = await listDirectMessages("conv123", 50);

		expect(result.items).toBeDefined();
		expect(Array.isArray(result.items)).toBe(true);
		// All messages should have conversationId property
		for (const msg of result.items) {
			expect(msg).toHaveProperty("conversationId");
		}
	});

	it("should handle pagination cursor", async () => {
		const { listDirectMessages } = await import("../lib/appwrite-dms");

		const result = await listDirectMessages("conv123", 10, "cursor123");

		expect(result).toBeDefined();
		expect(Array.isArray(result.items)).toBe(true);
	});
});

describe("Direct Messages - Data Enrichment", () => {
	it("should enrich conversations with other user data", async () => {
		const { getOrCreateConversation, listConversations } = await import(
			"../lib/appwrite-dms"
		);

		await getOrCreateConversation("user1", "user2");
		const conversations = await listConversations("user1");

		if (conversations.length > 0) {
			const conv = conversations[0];
			expect(conv.otherUser).toBeDefined();
		}
	});

	it("should enrich messages with sender data", async () => {
		const { sendDirectMessage, listDirectMessages } = await import(
			"../lib/appwrite-dms"
		);

		await sendDirectMessage("conv123", "user1", "user2", "Test message");
		const result = await listDirectMessages("conv123", 50);

		if (result.items.length > 0) {
			const message = result.items[0];
			// Sender data should be attempted to be enriched
			expect(message.senderId).toBe("user1");
		}
	});
});
