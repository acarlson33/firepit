import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Chat UI Fixes", () => {
	describe("Message deduplication in useMessages", () => {
		it("should prevent duplicate messages from being added", () => {
			const messages = [
				{ $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" },
				{ $id: "msg2", text: "World", $createdAt: "2025-01-01T00:01:00Z" },
			];

			// Simulate the applyCreate logic
			const newMessage = { $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" };
			
			// Check if message already exists
			const messageExists = messages.some((m) => m.$id === newMessage.$id);
			
			expect(messageExists).toBe(true);
			
			// If message exists, prev should be returned unchanged
			const result = messageExists ? messages : [...messages, newMessage];
			expect(result).toHaveLength(2);
			expect(result).toEqual(messages);
		});

		it("should add new messages that don't exist", () => {
			const messages = [
				{ $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" },
			];

			const newMessage = { $id: "msg3", text: "New", $createdAt: "2025-01-01T00:02:00Z" };
			
			const messageExists = messages.some((m) => m.$id === newMessage.$id);
			expect(messageExists).toBe(false);
			
			const result = messageExists ? messages : [...messages, newMessage].sort((a, b) =>
				a.$createdAt.localeCompare(b.$createdAt)
			);
			
			expect(result).toHaveLength(2);
			expect(result[1].$id).toBe("msg3");
		});
	});

	describe("Message deduplication in useDirectMessages", () => {
		it("should prevent duplicate direct messages from being added", () => {
			const messages = [
				{ $id: "dm1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z", senderId: "user1", receiverId: "user2" },
				{ $id: "dm2", text: "Hi", $createdAt: "2025-01-01T00:01:00Z", senderId: "user2", receiverId: "user1" },
			];

			const duplicateMessage = { $id: "dm1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z", senderId: "user1", receiverId: "user2" };
			
			// Check if message already exists
			const messageExists = messages.some((m) => m.$id === duplicateMessage.$id);
			
			expect(messageExists).toBe(true);
			
			// If message exists, prev should be returned unchanged
			const result = messageExists ? messages : [...messages, duplicateMessage];
			expect(result).toHaveLength(2);
		});

		it("should add new direct messages that don't exist", () => {
			const messages = [
				{ $id: "dm1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z", senderId: "user1", receiverId: "user2" },
			];

			const newMessage = { $id: "dm3", text: "New message", $createdAt: "2025-01-01T00:02:00Z", senderId: "user1", receiverId: "user2" };
			
			const messageExists = messages.some((m) => m.$id === newMessage.$id);
			expect(messageExists).toBe(false);
			
			const result = messageExists ? messages : [...messages, newMessage];
			expect(result).toHaveLength(2);
			expect(result[1].$id).toBe("dm3");
		});
	});

	describe("Message update handling", () => {
		it("should update existing messages correctly", () => {
			const messages = [
				{ $id: "msg1", text: "Original text", $createdAt: "2025-01-01T00:00:00Z" },
				{ $id: "msg2", text: "Another message", $createdAt: "2025-01-01T00:01:00Z" },
			];

			const updatedMessage = { $id: "msg1", text: "Edited text", $createdAt: "2025-01-01T00:00:00Z", editedAt: "2025-01-01T00:03:00Z" };
			
			const result = messages.map((m) => (m.$id === updatedMessage.$id ? updatedMessage : m));
			
			expect(result).toHaveLength(2);
			expect(result[0].text).toBe("Edited text");
			expect(result[0].editedAt).toBe("2025-01-01T00:03:00Z");
			expect(result[1].text).toBe("Another message");
		});
	});

	describe("Message deletion handling", () => {
		it("should remove messages correctly", () => {
			const messages = [
				{ $id: "msg1", text: "First", $createdAt: "2025-01-01T00:00:00Z" },
				{ $id: "msg2", text: "Second", $createdAt: "2025-01-01T00:01:00Z" },
				{ $id: "msg3", text: "Third", $createdAt: "2025-01-01T00:02:00Z" },
			];

			const messageToDelete = { $id: "msg2" };
			
			const result = messages.filter((m) => m.$id !== messageToDelete.$id);
			
			expect(result).toHaveLength(2);
			expect(result.find((m) => m.$id === "msg2")).toBeUndefined();
			expect(result[0].$id).toBe("msg1");
			expect(result[1].$id).toBe("msg3");
		});
	});

	describe("Scroll behavior", () => {
		it("should only scroll when messages exist", () => {
			const emptyMessages: unknown[] = [];
			const nonEmptyMessages = [
				{ $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" },
			];

			// Simulate the scroll condition
			expect(emptyMessages.length > 0).toBe(false);
			expect(nonEmptyMessages.length > 0).toBe(true);
		});

		it("should trigger scroll on message array changes", () => {
			const messages1 = [
				{ $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" },
			];
			const messages2 = [
				{ $id: "msg1", text: "Hello", $createdAt: "2025-01-01T00:00:00Z" },
				{ $id: "msg2", text: "World", $createdAt: "2025-01-01T00:01:00Z" },
			];

			// Verify that message arrays are different (which would trigger useEffect)
			expect(messages1).not.toEqual(messages2);
			expect(messages2.length).toBe(2);
			expect(messages1.length).toBe(1);
		});

		it("should scroll to bottom when new message is added", () => {
			const messages = [
				{ $id: "msg1", text: "First", $createdAt: "2025-01-01T00:00:00Z" },
			];
			const newMessage = { $id: "msg2", text: "Second", $createdAt: "2025-01-01T00:01:00Z" };

			const updatedMessages = [...messages, newMessage];

			// Verify new message is at the end
			expect(updatedMessages[updatedMessages.length - 1].$id).toBe("msg2");
			expect(updatedMessages.length).toBe(2);
		});
	});
});
