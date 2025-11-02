import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  uploadImage,
  deleteImage,
  getOrCreateConversation,
  listConversations,
  sendDirectMessage,
  listDirectMessages,
  deleteDirectMessage,
  editDirectMessage,
  loadMessageImages,
} from "@/lib/appwrite-dms-client";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("appwrite-dms-client", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("uploadImage", () => {
    it("should upload an image successfully", async () => {
      const mockFile = new File(["test"], "test.png", { type: "image/png" });
      const mockResponse = {
        fileId: "file123",
        url: "https://example.com/image.png",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await uploadImage(mockFile);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith("/api/upload-image", {
        method: "POST",
        body: expect.any(FormData),
      });
    });

    it("should throw error on upload failure", async () => {
      const mockFile = new File(["test"], "test.png", { type: "image/png" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Upload failed" }),
      });

      await expect(uploadImage(mockFile)).rejects.toThrow("Upload failed");
    });

    it("should throw generic error when no error message provided", async () => {
      const mockFile = new File(["test"], "test.png", { type: "image/png" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(uploadImage(mockFile)).rejects.toThrow("Failed to upload image");
    });
  });

  describe("deleteImage", () => {
    it("should delete an image successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(deleteImage("file123")).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/upload-image?fileId=file123",
        { method: "DELETE" }
      );
    });

    it("should handle special characters in fileId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await deleteImage("file@123#test");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/upload-image?fileId=file%40123%23test",
        { method: "DELETE" }
      );
    });

    it("should throw error on delete failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Delete failed" }),
      });

      await expect(deleteImage("file123")).rejects.toThrow("Delete failed");
    });

    it("should throw generic error when no error message provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(deleteImage("file123")).rejects.toThrow("Failed to delete image");
    });
  });

  describe("getOrCreateConversation", () => {
    it("should get or create a conversation successfully", async () => {
      const mockConversation = {
        $id: "conv123",
        participants: ["user1", "user2"],
        lastMessageAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation: mockConversation }),
      });

      const result = await getOrCreateConversation("user1", "user2");

      expect(result).toEqual(mockConversation);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/direct-messages?type=conversation&userId1=user1&userId2=user2"
      );
    });

    it("should handle special characters in user IDs", async () => {
      const mockConversation = {
        $id: "conv123",
        participants: ["user@1", "user#2"],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation: mockConversation }),
      });

      await getOrCreateConversation("user@1", "user#2");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/direct-messages?type=conversation&userId1=user%401&userId2=user%232"
      );
    });

    it("should throw error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Conversation creation failed" }),
      });

      await expect(getOrCreateConversation("user1", "user2")).rejects.toThrow(
        "Conversation creation failed"
      );
    });
  });

  describe("listConversations", () => {
    it("should list conversations and enrich with profiles", async () => {
      const mockConversations = [
        { $id: "conv1", participants: ["user1", "user2"], lastMessageAt: new Date().toISOString() },
        { $id: "conv2", participants: ["user1", "user3"], lastMessageAt: new Date().toISOString() },
      ];

      const mockProfiles = {
        user2: { displayName: "User Two", avatarUrl: "avatar2.png", status: { status: "online" } },
        user3: { displayName: "User Three", avatarUrl: "avatar3.png", status: { status: "offline" } },
      };

      // First call for conversations list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: mockConversations }),
      });

      // Second call for batch profiles
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profiles: mockProfiles }),
      });

      const result = await listConversations("user1");

      expect(result).toHaveLength(2);
      expect(result[0].otherUser).toEqual({
        userId: "user2",
        displayName: "User Two",
        avatarUrl: "avatar2.png",
        status: "online",
      });
      expect(result[1].otherUser).toEqual({
        userId: "user3",
        displayName: "User Three",
        avatarUrl: "avatar3.png",
        status: "offline",
      });
    });

    it("should handle empty conversations list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: [] }),
      });

      const result = await listConversations("user1");

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No batch profile fetch
    });

    it("should handle conversations without matching participants", async () => {
      const mockConversations = [
        { $id: "conv1", participants: ["user1"], lastMessageAt: new Date().toISOString() },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: mockConversations }),
      });

      const result = await listConversations("user1");

      expect(result[0].otherUser).toBeUndefined();
    });

    it("should throw error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to fetch conversations" }),
      });

      await expect(listConversations("user1")).rejects.toThrow(
        "Failed to fetch conversations"
      );
    });
  });

  describe("sendDirectMessage", () => {
    it("should send a direct message with text only", async () => {
      const mockMessage = {
        $id: "msg123",
        conversationId: "conv123",
        senderId: "user1",
        receiverId: "user2",
        text: "Hello",
        $createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: mockMessage }),
      });

      const result = await sendDirectMessage(
        "conv123",
        "user1",
        "user2",
        "Hello"
      );

      expect(result).toEqual(mockMessage);
      expect(mockFetch).toHaveBeenCalledWith("/api/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"text":"Hello"'),
      });
    });

    it("should send a direct message with image", async () => {
      const mockMessage = {
        $id: "msg123",
        conversationId: "conv123",
        senderId: "user1",
        receiverId: "user2",
        text: "Check this out",
        imageFileId: "img123",
        imageUrl: "https://example.com/image.png",
        $createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: mockMessage }),
      });

      const result = await sendDirectMessage(
        "conv123",
        "user1",
        "user2",
        "Check this out",
        "img123",
        "https://example.com/image.png"
      );

      expect(result).toEqual(mockMessage);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.imageFileId).toBe("img123");
      expect(callBody.imageUrl).toBe("https://example.com/image.png");
    });

    it("should send a direct message with mentions", async () => {
      const mockMessage = {
        $id: "msg123",
        conversationId: "conv123",
        senderId: "user1",
        receiverId: "user2",
        text: "Hey @user2",
        $createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: mockMessage }),
      });

      await sendDirectMessage("conv123", "user1", "user2", "Hey @user2");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.mentions).toEqual(["user2"]);
    });

    it("should send a direct message with reply", async () => {
      const mockMessage = {
        $id: "msg124",
        conversationId: "conv123",
        senderId: "user1",
        receiverId: "user2",
        text: "Replying",
        replyToId: "msg123",
        $createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: mockMessage }),
      });

      const result = await sendDirectMessage(
        "conv123",
        "user1",
        "user2",
        "Replying",
        undefined,
        undefined,
        "msg123"
      );

      expect(result.replyToId).toBe("msg123");
    });

    it("should send a direct message with attachments", async () => {
      const attachments = [
        { fileId: "file1", fileName: "doc.pdf", fileType: "application/pdf" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            $id: "msg123",
            conversationId: "conv123",
            attachments,
          },
        }),
      });

      await sendDirectMessage(
        "conv123",
        "user1",
        "user2",
        "Here's a file",
        undefined,
        undefined,
        undefined,
        attachments
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.attachments).toEqual(attachments);
    });

    it("should throw error on send failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Send failed" }),
      });

      await expect(
        sendDirectMessage("conv123", "user1", "user2", "Hello")
      ).rejects.toThrow("Send failed");
    });
  });

  describe("listDirectMessages", () => {
    it("should list direct messages successfully", async () => {
      const mockMessages = [
        { $id: "msg1", text: "Hello", senderId: "user1" },
        { $id: "msg2", text: "Hi", senderId: "user2" },
      ];

      // First call for messages
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: mockMessages, nextCursor: null }),
      });

      // Second call for batch profiles
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profiles: {} }),
      });

      const result = await listDirectMessages("conv123");

      expect(result.items).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/direct-messages?type=messages&conversationId=conv123&limit=50"
      );
    });

    it("should list messages with pagination", async () => {
      const mockMessages = [{ $id: "msg1", text: "Hello", senderId: "user1" }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: mockMessages, nextCursor: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ profiles: {} }),
        });

      await listDirectMessages("conv123", 50, "lastMsgId");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/direct-messages?type=messages&conversationId=conv123&limit=50&cursor=lastMsgId"
      );
    });

    it("should throw error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to fetch" }),
      });

      await expect(listDirectMessages("conv123")).rejects.toThrow(
        "Failed to fetch"
      );
    });
  });

  describe("deleteDirectMessage", () => {
    it("should delete a direct message successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(deleteDirectMessage("msg123", "user1")).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith("/api/direct-messages?id=msg123", {
        method: "DELETE",
      });
    });

    it("should throw error on delete failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Delete failed" }),
      });

      await expect(deleteDirectMessage("msg123", "user1")).rejects.toThrow("Delete failed");
    });
  });

  describe("editDirectMessage", () => {
    it("should edit a direct message successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(editDirectMessage("msg123", "Updated text")).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith("/api/direct-messages?id=msg123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Updated text",
        }),
      });
    });

    it("should throw error on edit failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Edit failed" }),
      });

      await expect(editDirectMessage("msg123", "Updated")).rejects.toThrow(
        "Edit failed"
      );
    });
  });

  describe("loadMessageImages", () => {
    it("should return empty map for messages without images", async () => {
      const messages = [
        { $id: "msg1", text: "Test", imageFileId: null },
        { $id: "msg2", text: "No image" },
      ];

      const result = await loadMessageImages(messages as never[]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return empty map for messages with existing imageUrl", async () => {
      const messages = [
        { $id: "msg1", imageFileId: "img1", imageUrl: "existing.png", text: "Has URL" },
      ];

      const result = await loadMessageImages(messages as never[]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return empty map for empty array", async () => {
      const result = await loadMessageImages([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
