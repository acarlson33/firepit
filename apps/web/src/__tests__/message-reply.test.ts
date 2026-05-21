import { describe, expect, it } from "vitest";
import type { Message, DirectMessage } from "@/lib/types";
import { enrichMessageWithReplyContext } from "@/lib/enrich-messages";

describe("Message Reply Feature", () => {
  it("should have replyToId field in Message type", () => {
    const message: Message = {
      $id: "msg1",
      userId: "user1",
      text: "Hello",
      $createdAt: new Date().toISOString(),
      replyToId: "msg0",
    };
    expect(message.replyToId).toBe("msg0");
  });

  it("should have replyToId field in DirectMessage type", () => {
    const dm: DirectMessage = {
      $id: "dm1",
      conversationId: "conv1",
      senderId: "user1",
      receiverId: "user2",
      text: "Hello",
      $createdAt: new Date().toISOString(),
      replyToId: "dm0",
    };
    expect(dm.replyToId).toBe("dm0");
  });

  it("should enrich message with reply context", () => {
    const parentMessage: Message = {
      $id: "msg0",
      userId: "user1",
      userName: "Alice",
      displayName: "Alice Smith",
      text: "Original message",
      $createdAt: new Date().toISOString(),
    };

    const replyMessage: Message = {
      $id: "msg1",
      userId: "user2",
      userName: "Bob",
      text: "Reply to original",
      $createdAt: new Date().toISOString(),
      replyToId: "msg0",
    };

    const messages = [parentMessage, replyMessage];
    const enriched = enrichMessageWithReplyContext(replyMessage, messages);

    expect(enriched.replyTo).toBeDefined();
    expect(enriched.replyTo?.text).toBe("Original message");
    expect(enriched.replyTo?.displayName).toBe("Alice Smith");
    expect(enriched.replyTo?.userName).toBe("Alice");
  });

  it("should handle missing parent message gracefully", () => {
    const replyMessage: Message = {
      $id: "msg1",
      userId: "user2",
      userName: "Bob",
      text: "Reply to missing message",
      $createdAt: new Date().toISOString(),
      replyToId: "nonexistent",
    };

    const messages = [replyMessage];
    const enriched = enrichMessageWithReplyContext(replyMessage, messages);

    expect(enriched.replyTo).toBeUndefined();
  });

  it("should not enrich message without replyToId", () => {
    const message: Message = {
      $id: "msg1",
      userId: "user1",
      userName: "Alice",
      text: "Regular message",
      $createdAt: new Date().toISOString(),
    };

    const messages = [message];
    const enriched = enrichMessageWithReplyContext(message, messages);

    expect(enriched.replyTo).toBeUndefined();
  });
});
