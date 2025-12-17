import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationSettings } from "../lib/types";
import {
	extractMentionedUserIds,
	isReplyToUser,
	buildNotificationPayload,
	shouldNotifyUser,
} from "../lib/notification-triggers";
import {
	getOrCreateNotificationSettings,
	getEffectiveNotificationLevel,
	isInQuietHours,
} from "../lib/notification-settings";

// Mock the notification-settings module
vi.mock("../lib/notification-settings", () => {
	return {
		getOrCreateNotificationSettings: vi.fn(),
		getEffectiveNotificationLevel: vi.fn(),
		isInQuietHours: vi.fn(),
	};
});

describe("Notification Triggers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("extractMentionedUserIds", () => {
		it("should extract user IDs from mentions", () => {
			const messageContent = "Hey <@user123> and <@user456>, check this out!";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual(["user123", "user456"]);
		});

		it("should handle messages with no mentions", () => {
			const messageContent = "Just a regular message";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual([]);
		});

		it("should handle single mention", () => {
			const messageContent = "Hello <@user789>";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual(["user789"]);
		});

		it("should handle alphanumeric user IDs", () => {
			const messageContent = "<@abc123DEF456>";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual(["abc123DEF456"]);
		});

		it("should handle multiple mentions of same user", () => {
			const messageContent = "<@user123> hey <@user123>";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual(["user123", "user123"]);
		});

		it("should not match malformed mentions", () => {
			const messageContent = "@user123 or <@> or <@ user456>";
			const result = extractMentionedUserIds(messageContent);

			expect(result).toEqual([]);
		});
	});

	describe("isReplyToUser", () => {
		it("should return true when reply is to the user", () => {
			const result = isReplyToUser("user-123", "user-123");
			expect(result).toBe(true);
		});

		it("should return false when reply is to different user", () => {
			const result = isReplyToUser("user-123", "user-456");
			expect(result).toBe(false);
		});

		it("should return false when replyToAuthorId is undefined", () => {
			const result = isReplyToUser(undefined, "user-123");
			expect(result).toBe(false);
		});
	});

	describe("buildNotificationPayload", () => {
		it("should build payload for DM notification", () => {
			const result = buildNotificationPayload("dm", {
				senderName: "Alice",
				messageContent: "Hey there!",
				conversationId: "conv-123",
			});

			expect(result.type).toBe("dm");
			expect(result.title).toBe("Alice");
			expect(result.body).toBe("Hey there!");
			expect(result.url).toBe("/dm/conv-123");
			expect(result.data.conversationId).toBe("conv-123");
		});

		it("should build payload for mention notification", () => {
			const result = buildNotificationPayload("mention", {
				senderName: "Bob",
				messageContent: "Hey <@user123> check this",
				channelName: "general",
				serverName: "My Server",
				channelId: "channel-123",
				serverId: "server-456",
				messageId: "msg-789",
			});

			expect(result.type).toBe("mention");
			expect(result.title).toBe("Bob mentioned you in #general");
			expect(result.body).toBe("Hey <@user123> check this");
			expect(result.url).toBe("/servers/server-456/channels/channel-123?message=msg-789");
		});

		it("should build payload for thread reply notification", () => {
			const result = buildNotificationPayload("thread_reply", {
				senderName: "Charlie",
				messageContent: "Good point!",
				channelName: "dev-chat",
				channelId: "channel-123",
				serverId: "server-456",
			});

			expect(result.type).toBe("thread_reply");
			expect(result.title).toBe("Charlie replied in #dev-chat");
			expect(result.body).toBe("Good point!");
			expect(result.url).toBe("/servers/server-456/channels/channel-123");
		});

		it("should build payload for regular message notification", () => {
			const result = buildNotificationPayload("message", {
				senderName: "Diana",
				messageContent: "Hello everyone",
				channelName: "announcements",
				serverName: "Community",
				channelId: "channel-123",
				serverId: "server-456",
			});

			expect(result.type).toBe("message");
			expect(result.title).toBe("#announcements in Community");
			expect(result.body).toBe("Diana: Hello everyone");
		});

		it("should truncate long message content", () => {
			const longMessage = "a".repeat(150);
			const result = buildNotificationPayload("dm", {
				senderName: "Alice",
				messageContent: longMessage,
				conversationId: "conv-123",
			});

			expect(result.body.length).toBe(100);
			expect(result.body).toBe("a".repeat(97) + "...");
		});

		it("should not truncate short messages", () => {
			const shortMessage = "Short message";
			const result = buildNotificationPayload("dm", {
				senderName: "Alice",
				messageContent: shortMessage,
				conversationId: "conv-123",
			});

			expect(result.body).toBe(shortMessage);
		});

		it("should include sender avatar URL when provided", () => {
			const result = buildNotificationPayload("dm", {
				senderName: "Alice",
				senderAvatarUrl: "https://example.com/avatar.png",
				messageContent: "Hi",
				conversationId: "conv-123",
			});

			expect(result.icon).toBe("https://example.com/avatar.png");
		});

		it("should handle missing optional fields gracefully", () => {
			const result = buildNotificationPayload("mention", {
				senderName: "Bob",
				messageContent: "Test",
			});

			expect(result.type).toBe("mention");
			expect(result.title).toBe("Bob mentioned you");
			expect(result.url).toBe("/");
		});
	});

	describe("shouldNotifyUser", () => {
		const createMockSettings = (
			globalLevel: "all" | "mentions" | "nothing",
			overrides = {}
		): NotificationSettings => ({
			$id: "settings-1",
			userId: "recipient-123",
			globalNotifications: globalLevel,
			desktopNotifications: true,
			pushNotifications: true,
			notificationSound: true,
			serverOverrides: {},
			channelOverrides: {},
			conversationOverrides: {},
			...overrides,
		});

		it("should not notify when sender is recipient", async () => {
			const result = await shouldNotifyUser({
				senderId: "user-123",
				recipientId: "user-123",
				channelId: "channel-1",
			});

			expect(result.shouldNotify).toBe(false);
			expect(result.reason).toBe("sender_is_recipient");
		});

		it("should notify for DM when level is 'all'", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("all")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("all");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				conversationId: "conv-1",
			});

			expect(result.shouldNotify).toBe(true);
			expect(result.type).toBe("dm");
			expect(result.showDesktop).toBe(true);
			expect(result.playSound).toBe(true);
			expect(result.sendPush).toBe(true);
		});

		it("should notify for mention when level is 'mentions'", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("mentions")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("mentions");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
				mentionedUserIds: ["recipient-456"],
			});

			expect(result.shouldNotify).toBe(true);
			expect(result.type).toBe("mention");
		});

		it("should not notify for regular message when level is 'mentions'", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("mentions")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("mentions");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
			});

			expect(result.shouldNotify).toBe(false);
			expect(result.reason).toContain("level_mentions_blocks_message");
		});

		it("should not notify when level is 'nothing'", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("nothing")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("nothing");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
			});

			expect(result.shouldNotify).toBe(false);
		});

		it("should not notify during quiet hours", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("all")
			);
			vi.mocked(isInQuietHours).mockReturnValue(true);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
			});

			expect(result.shouldNotify).toBe(false);
			expect(result.reason).toBe("quiet_hours");
		});

		it("should notify for thread reply when level is 'mentions'", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("mentions")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("mentions");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
				isReplyToRecipient: true,
			});

			expect(result.shouldNotify).toBe(true);
			expect(result.type).toBe("thread_reply");
		});

		it("should respect notification preferences in result", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue({
				...createMockSettings("all"),
				desktopNotifications: false,
				pushNotifications: false,
				notificationSound: false,
			});
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("all");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				conversationId: "conv-1",
			});

			expect(result.shouldNotify).toBe(true);
			expect(result.showDesktop).toBe(false);
			expect(result.playSound).toBe(false);
			expect(result.sendPush).toBe(false);
		});

		it("should handle missing settings gracefully", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(null as never);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
			});

			expect(result.shouldNotify).toBe(false);
			expect(result.reason).toBe("failed_to_load_settings");
		});

		it("should determine event type as 'message' for regular channel message", async () => {
			vi.mocked(getOrCreateNotificationSettings).mockResolvedValue(
				createMockSettings("all")
			);
			vi.mocked(getEffectiveNotificationLevel).mockReturnValue("all");
			vi.mocked(isInQuietHours).mockReturnValue(false);

			const result = await shouldNotifyUser({
				senderId: "sender-123",
				recipientId: "recipient-456",
				channelId: "channel-1",
				serverId: "server-1",
			});

			expect(result.shouldNotify).toBe(true);
			expect(result.type).toBe("message");
		});
	});
});
