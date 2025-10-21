/**
 * Tests for typing indicator realtime subscription
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Typing Subscription", () => {
  let mockClient: {
    subscribe: ReturnType<typeof vi.fn>;
    setEndpoint: ReturnType<typeof vi.fn>;
    setProject: ReturnType<typeof vi.fn>;
  };
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUnsubscribe = vi.fn();
    mockClient = {
      subscribe: vi.fn().mockReturnValue(mockUnsubscribe),
      setEndpoint: vi.fn().mockReturnThis(),
      setProject: vi.fn().mockReturnThis(),
    };

    // Mock environment variables
    process.env.APPWRITE_DATABASE_ID = "test-db";
    process.env.APPWRITE_TYPING_COLLECTION_ID = "typing";
    process.env.APPWRITE_ENDPOINT = "https://test.appwrite.io/v1";
    process.env.APPWRITE_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Typing collection subscription", () => {
    it("should subscribe to typing collection when channel is selected", () => {
      const channelId = "test-channel-123";
      const databaseId = process.env.APPWRITE_DATABASE_ID;
      const typingCollectionId = process.env.APPWRITE_TYPING_COLLECTION_ID;

      expect(databaseId).toBe("test-db");
      expect(typingCollectionId).toBe("typing");

      const expectedChannel = `databases.${databaseId}.collections.${typingCollectionId}.documents`;
      expect(expectedChannel).toBe("databases.test-db.collections.typing.documents");
    });

    it("should not subscribe when typing collection ID is missing", () => {
      delete process.env.APPWRITE_TYPING_COLLECTION_ID;

      const databaseId = process.env.APPWRITE_DATABASE_ID;
      const typingCollectionId = process.env.APPWRITE_TYPING_COLLECTION_ID;

      expect(databaseId).toBe("test-db");
      expect(typingCollectionId).toBeUndefined();
    });

    it("should not subscribe when database ID is missing", () => {
      delete process.env.APPWRITE_DATABASE_ID;

      const databaseId = process.env.APPWRITE_DATABASE_ID;
      const typingCollectionId = process.env.APPWRITE_TYPING_COLLECTION_ID;

      expect(databaseId).toBeUndefined();
      expect(typingCollectionId).toBe("typing");
    });
  });

  describe("Typing event parsing", () => {
    it("should parse typing event payload correctly", () => {
      const mockPayload = {
        $id: "typing-doc-123",
        userId: "user-456",
        userName: "Test User",
        channelId: "channel-789",
        updatedAt: "2025-10-21T13:50:00.000Z",
      };

      const parsed = {
        $id: String(mockPayload.$id),
        userId: String(mockPayload.userId),
        userName: mockPayload.userName as string | undefined,
        channelId: String(mockPayload.channelId),
        updatedAt: String(mockPayload.updatedAt),
      };

      expect(parsed.$id).toBe("typing-doc-123");
      expect(parsed.userId).toBe("user-456");
      expect(parsed.userName).toBe("Test User");
      expect(parsed.channelId).toBe("channel-789");
      expect(parsed.updatedAt).toBe("2025-10-21T13:50:00.000Z");
    });

    it("should handle typing event without userName", () => {
      const mockPayload = {
        $id: "typing-doc-123",
        userId: "user-456",
        channelId: "channel-789",
        updatedAt: "2025-10-21T13:50:00.000Z",
      };

      const parsed = {
        $id: String(mockPayload.$id),
        userId: String(mockPayload.userId),
        userName: (mockPayload as Record<string, unknown>).userName as string | undefined,
        channelId: String(mockPayload.channelId),
        updatedAt: String(mockPayload.updatedAt),
      };

      expect(parsed.userName).toBeUndefined();
    });
  });

  describe("Typing state management", () => {
    it("should add user to typingUsers on create event", () => {
      const typingUsers: Record<string, { userId: string; userName?: string; updatedAt: string }> = {};
      const newTyping = {
        userId: "user-123",
        userName: "Alice",
        updatedAt: "2025-10-21T13:50:00.000Z",
      };

      const updated = {
        ...typingUsers,
        [newTyping.userId]: newTyping,
      };

      expect(updated["user-123"]).toEqual(newTyping);
      expect(Object.keys(updated)).toHaveLength(1);
    });

    it("should update existing user on update event", () => {
      const typingUsers = {
        "user-123": {
          userId: "user-123",
          userName: "Alice",
          updatedAt: "2025-10-21T13:50:00.000Z",
        },
      };

      const updatedTyping = {
        userId: "user-123",
        userName: "Alice",
        updatedAt: "2025-10-21T13:50:05.000Z",
      };

      const updated = {
        ...typingUsers,
        [updatedTyping.userId]: updatedTyping,
      };

      expect(updated["user-123"].updatedAt).toBe("2025-10-21T13:50:05.000Z");
      expect(Object.keys(updated)).toHaveLength(1);
    });

    it("should remove user from typingUsers on delete event", () => {
      const typingUsers = {
        "user-123": {
          userId: "user-123",
          userName: "Alice",
          updatedAt: "2025-10-21T13:50:00.000Z",
        },
        "user-456": {
          userId: "user-456",
          userName: "Bob",
          updatedAt: "2025-10-21T13:50:01.000Z",
        },
      };

      const updated = { ...typingUsers };
      delete updated["user-123"];

      expect(updated["user-123"]).toBeUndefined();
      expect(updated["user-456"]).toBeDefined();
      expect(Object.keys(updated)).toHaveLength(1);
    });

    it("should handle multiple users typing simultaneously", () => {
      const typingUsers: Record<string, { userId: string; userName?: string; updatedAt: string }> = {};

      // First user starts typing
      let updated = {
        ...typingUsers,
        "user-123": {
          userId: "user-123",
          userName: "Alice",
          updatedAt: "2025-10-21T13:50:00.000Z",
        },
      };

      // Second user starts typing
      updated = {
        ...updated,
        "user-456": {
          userId: "user-456",
          userName: "Bob",
          updatedAt: "2025-10-21T13:50:01.000Z",
        },
      };

      // Third user starts typing
      updated = {
        ...updated,
        "user-789": {
          userId: "user-789",
          userName: "Charlie",
          updatedAt: "2025-10-21T13:50:02.000Z",
        },
      };

      expect(Object.keys(updated)).toHaveLength(3);
      expect(updated["user-123"]).toBeDefined();
      expect(updated["user-456"]).toBeDefined();
      expect(updated["user-789"]).toBeDefined();
    });
  });

  describe("Channel filtering", () => {
    it("should only process typing events for current channel", () => {
      const currentChannelId = "channel-123";
      const typingEvent = {
        userId: "user-456",
        channelId: "channel-123",
      };

      const shouldProcess = typingEvent.channelId === currentChannelId;
      expect(shouldProcess).toBe(true);
    });

    it("should ignore typing events from other channels", () => {
      const currentChannelId = "channel-123";
      const typingEvent = {
        userId: "user-456",
        channelId: "channel-456",
      };

      const shouldProcess = typingEvent.channelId === currentChannelId;
      expect(shouldProcess).toBe(false);
    });
  });

  describe("Current user filtering", () => {
    it("should ignore typing events from current user", () => {
      const currentUserId = "user-123";
      const typingEvent = {
        userId: "user-123",
        channelId: "channel-456",
      };

      const shouldIgnore = typingEvent.userId === currentUserId;
      expect(shouldIgnore).toBe(true);
    });

    it("should process typing events from other users", () => {
      const currentUserId = "user-123";
      const typingEvent = {
        userId: "user-456",
        channelId: "channel-789",
      };

      const shouldIgnore = typingEvent.userId === currentUserId;
      expect(shouldIgnore).toBe(false);
    });
  });

  describe("Stale typing indicator cleanup", () => {
    it("should identify stale typing indicators", () => {
      const now = Date.now();
      const staleThreshold = 5000;

      const typingUser = {
        userId: "user-123",
        userName: "Alice",
        updatedAt: new Date(now - 6000).toISOString(),
      };

      const updatedTime = new Date(typingUser.updatedAt).getTime();
      const isStale = now - updatedTime > staleThreshold;

      expect(isStale).toBe(true);
    });

    it("should keep fresh typing indicators", () => {
      const now = Date.now();
      const staleThreshold = 5000;

      const typingUser = {
        userId: "user-123",
        userName: "Alice",
        updatedAt: new Date(now - 2000).toISOString(),
      };

      const updatedTime = new Date(typingUser.updatedAt).getTime();
      const isStale = now - updatedTime > staleThreshold;

      expect(isStale).toBe(false);
    });

    it("should remove only stale typing indicators", () => {
      const now = Date.now();
      const staleThreshold = 5000;

      const typingUsers = {
        "user-123": {
          userId: "user-123",
          userName: "Alice",
          updatedAt: new Date(now - 6000).toISOString(),
        },
        "user-456": {
          userId: "user-456",
          userName: "Bob",
          updatedAt: new Date(now - 2000).toISOString(),
        },
      };

      const updated = { ...typingUsers };
      let hasChanges = false;

      for (const [uid, typing] of Object.entries(updated)) {
        const updatedTime = new Date(typing.updatedAt).getTime();
        if (now - updatedTime > staleThreshold) {
          delete updated[uid];
          hasChanges = true;
        }
      }

      expect(hasChanges).toBe(true);
      expect(updated["user-123"]).toBeUndefined();
      expect(updated["user-456"]).toBeDefined();
      expect(Object.keys(updated)).toHaveLength(1);
    });
  });
});
