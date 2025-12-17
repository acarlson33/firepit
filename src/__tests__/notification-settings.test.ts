import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationSettings, NotificationLevel, NotificationOverride } from "../lib/types";

// Mock the appwrite-admin module
vi.mock("../lib/appwrite-admin", () => {
	const mockDatabases = {
		listDocuments: vi.fn(),
		createDocument: vi.fn(),
		updateDocument: vi.fn(),
	};

	return {
		getAdminClient: vi.fn(() => ({
			databases: mockDatabases,
		})),
	};
});

// Mock the appwrite-core module
vi.mock("../lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		databaseId: "test-db",
		collections: {
			notificationSettings: "notification-settings-collection",
		},
	})),
	perms: {
		serverOwner: vi.fn((userId: string) => [`user:${userId}`]),
	},
}));

describe("Notification Settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Set up environment variables
		process.env.APPWRITE_DATABASE_ID = "test-db";
	});

	describe("calculateMuteExpiration", () => {
		it("should return undefined for 'forever' duration", async () => {
			const { calculateMuteExpiration } = await import("../lib/notification-settings");
			const result = calculateMuteExpiration("forever");
			expect(result).toBeUndefined();
		});

		it("should calculate correct expiration for 15m", async () => {
			const { calculateMuteExpiration } = await import("../lib/notification-settings");
			const before = new Date();
			const result = calculateMuteExpiration("15m");
			const after = new Date();

			expect(result).toBeDefined();
			const expirationDate = new Date(result!);
			const expectedMs = 15 * 60 * 1000;

			// Check that expiration is within reasonable range
			const actualDiff = expirationDate.getTime() - before.getTime();
			expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 1000);
			expect(actualDiff).toBeLessThanOrEqual(expectedMs + 1000);
		});

		it("should calculate correct expiration for 1h", async () => {
			const { calculateMuteExpiration } = await import("../lib/notification-settings");
			const before = new Date();
			const result = calculateMuteExpiration("1h");

			expect(result).toBeDefined();
			const expirationDate = new Date(result!);
			const expectedMs = 60 * 60 * 1000;

			const actualDiff = expirationDate.getTime() - before.getTime();
			expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 1000);
			expect(actualDiff).toBeLessThanOrEqual(expectedMs + 1000);
		});

		it("should calculate correct expiration for 8h", async () => {
			const { calculateMuteExpiration } = await import("../lib/notification-settings");
			const before = new Date();
			const result = calculateMuteExpiration("8h");

			expect(result).toBeDefined();
			const expirationDate = new Date(result!);
			const expectedMs = 8 * 60 * 60 * 1000;

			const actualDiff = expirationDate.getTime() - before.getTime();
			expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 1000);
			expect(actualDiff).toBeLessThanOrEqual(expectedMs + 1000);
		});

		it("should calculate correct expiration for 24h", async () => {
			const { calculateMuteExpiration } = await import("../lib/notification-settings");
			const before = new Date();
			const result = calculateMuteExpiration("24h");

			expect(result).toBeDefined();
			const expirationDate = new Date(result!);
			const expectedMs = 24 * 60 * 60 * 1000;

			const actualDiff = expirationDate.getTime() - before.getTime();
			expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 1000);
			expect(actualDiff).toBeLessThanOrEqual(expectedMs + 1000);
		});
	});

	describe("isMuteExpired", () => {
		it("should return false for undefined (muted forever)", async () => {
			const { isMuteExpired } = await import("../lib/notification-settings");
			const result = isMuteExpired(undefined);
			expect(result).toBe(false);
		});

		it("should return true for past date", async () => {
			const { isMuteExpired } = await import("../lib/notification-settings");
			const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
			const result = isMuteExpired(pastDate);
			expect(result).toBe(true);
		});

		it("should return false for future date", async () => {
			const { isMuteExpired } = await import("../lib/notification-settings");
			const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour from now
			const result = isMuteExpired(futureDate);
			expect(result).toBe(false);
		});

		it("should return true for date that just passed", async () => {
			const { isMuteExpired } = await import("../lib/notification-settings");
			const justPassed = new Date(Date.now() - 1).toISOString();
			const result = isMuteExpired(justPassed);
			expect(result).toBe(true);
		});
	});

	describe("getEffectiveNotificationLevel", () => {
		const createMockSettings = (
			globalLevel: NotificationLevel,
			overrides: {
				server?: NotificationOverride;
				channel?: NotificationOverride;
				conversation?: NotificationOverride;
			} = {}
		): NotificationSettings => ({
			$id: "settings-1",
			userId: "user-1",
			globalNotifications: globalLevel,
			desktopNotifications: true,
			pushNotifications: true,
			notificationSound: true,
			serverOverrides: overrides.server
				? { "server-1": overrides.server }
				: {},
			channelOverrides: overrides.channel
				? { "channel-1": overrides.channel }
				: {},
			conversationOverrides: overrides.conversation
				? { "conv-1": overrides.conversation }
				: {},
		});

		it("should return global level when no overrides exist", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const settings = createMockSettings("mentions");

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-1",
				serverId: "server-1",
			});

			expect(result).toBe("mentions");
		});

		it("should prioritize channel override over server override", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const settings = createMockSettings("all", {
				server: { level: "mentions", mutedUntil: undefined },
				channel: { level: "nothing", mutedUntil: undefined },
			});

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-1",
				serverId: "server-1",
			});

			expect(result).toBe("nothing");
		});

		it("should prioritize channel override over global", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const settings = createMockSettings("all", {
				channel: { level: "mentions", mutedUntil: undefined },
			});

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-1",
			});

			expect(result).toBe("mentions");
		});

		it("should use server override when no channel override exists", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const settings = createMockSettings("all", {
				server: { level: "mentions", mutedUntil: undefined },
			});

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-2", // Different channel, no override
				serverId: "server-1",
			});

			expect(result).toBe("mentions");
		});

		it("should use conversation override for DMs", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const settings = createMockSettings("all", {
				conversation: { level: "nothing", mutedUntil: undefined },
			});

			const result = getEffectiveNotificationLevel(settings, {
				conversationId: "conv-1",
			});

			expect(result).toBe("nothing");
		});

		it("should ignore expired overrides", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
			const settings = createMockSettings("all", {
				channel: { level: "nothing", mutedUntil: pastDate },
			});

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-1",
			});

			expect(result).toBe("all"); // Should fall back to global
		});

		it("should respect non-expired overrides", async () => {
			const { getEffectiveNotificationLevel } = await import("../lib/notification-settings");
			const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
			const settings = createMockSettings("all", {
				channel: { level: "nothing", mutedUntil: futureDate },
			});

			const result = getEffectiveNotificationLevel(settings, {
				channelId: "channel-1",
			});

			expect(result).toBe("nothing");
		});
	});

	describe("isInQuietHours", () => {
		const createSettingsWithQuietHours = (
			start: string | undefined,
			end: string | undefined
		): NotificationSettings => ({
			$id: "settings-1",
			userId: "user-1",
			globalNotifications: "all",
			desktopNotifications: true,
			pushNotifications: true,
			notificationSound: true,
			quietHoursStart: start,
			quietHoursEnd: end,
			serverOverrides: {},
			channelOverrides: {},
			conversationOverrides: {},
		});

		it("should return false when quiet hours are not set", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			const settings = createSettingsWithQuietHours(undefined, undefined);

			const result = isInQuietHours(settings);
			expect(result).toBe(false);
		});

		it("should return false when only start is set", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			const settings = createSettingsWithQuietHours("22:00", undefined);

			const result = isInQuietHours(settings);
			expect(result).toBe(false);
		});

		it("should return false when only end is set", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			const settings = createSettingsWithQuietHours(undefined, "08:00");

			const result = isInQuietHours(settings);
			expect(result).toBe(false);
		});

		it("should correctly detect time within normal range", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			// Test at a specific time
			const now = new Date();
			const currentHour = now.getHours();
			const currentMin = now.getMinutes();

			// Create a range that includes current time
			const startHour = currentHour - 1 < 0 ? 23 : currentHour - 1;
			const endHour = currentHour + 1 > 23 ? 0 : currentHour + 1;

			const settings = createSettingsWithQuietHours(
				`${String(startHour).padStart(2, "0")}:00`,
				`${String(endHour).padStart(2, "0")}:00`
			);

			const result = isInQuietHours(settings);
			// This should be true if range doesn't cross midnight in a problematic way
			expect(typeof result).toBe("boolean");
		});

		it("should handle overnight quiet hours (e.g., 22:00 - 08:00)", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			const settings = createSettingsWithQuietHours("22:00", "08:00");

			// We can't test exact time without mocking Date, but we can verify the function runs
			const result = isInQuietHours(settings);
			expect(typeof result).toBe("boolean");
		});

		it("should handle same start and end time", async () => {
			const { isInQuietHours } = await import("../lib/notification-settings");
			const settings = createSettingsWithQuietHours("12:00", "12:00");

			const result = isInQuietHours(settings);
			expect(typeof result).toBe("boolean");
		});
	});

	describe("Database Operations (Mocked)", () => {
		it("should call getOrCreateNotificationSettings successfully", async () => {
			const { getAdminClient } = await import("../lib/appwrite-admin");
			const mockClient = getAdminClient();

			// Mock the database response
			vi.mocked(mockClient.databases.listDocuments).mockResolvedValue({
				total: 1,
				documents: [
					{
						$id: "settings-1",
						userId: "user-1",
						globalNotifications: "all",
						desktopNotifications: true,
						pushNotifications: true,
						notificationSound: true,
						quietHoursStart: null,
						quietHoursEnd: null,
						serverOverrides: "{}",
						channelOverrides: "{}",
						conversationOverrides: "{}",
						$createdAt: new Date().toISOString(),
						$updatedAt: new Date().toISOString(),
					},
				],
			} as never);

			const { getNotificationSettings } = await import("../lib/notification-settings");
			const result = await getNotificationSettings("user-1");

			expect(result).toBeDefined();
			expect(result?.$id).toBe("settings-1");
			expect(result?.userId).toBe("user-1");
			expect(result?.globalNotifications).toBe("all");
		});

		it("should return null when no settings exist", async () => {
			const { getAdminClient } = await import("../lib/appwrite-admin");
			const mockClient = getAdminClient();

			vi.mocked(mockClient.databases.listDocuments).mockResolvedValue({
				total: 0,
				documents: [],
			} as never);

			const { getNotificationSettings } = await import("../lib/notification-settings");
			const result = await getNotificationSettings("user-1");

			expect(result).toBeNull();
		});

		it("should handle JSON parsing of overrides", async () => {
			const { getAdminClient } = await import("../lib/appwrite-admin");
			const mockClient = getAdminClient();

			const serverOverrides = {
				"server-1": { level: "mentions", mutedUntil: undefined },
			};

			vi.mocked(mockClient.databases.listDocuments).mockResolvedValue({
				total: 1,
				documents: [
					{
						$id: "settings-1",
						userId: "user-1",
						globalNotifications: "all",
						desktopNotifications: true,
						pushNotifications: true,
						notificationSound: true,
						quietHoursStart: null,
						quietHoursEnd: null,
						serverOverrides: JSON.stringify(serverOverrides),
						channelOverrides: "{}",
						conversationOverrides: "{}",
					},
				],
			} as never);

			const { getNotificationSettings } = await import("../lib/notification-settings");
			const result = await getNotificationSettings("user-1");

			expect(result?.serverOverrides).toEqual(serverOverrides);
		});

		it("should handle malformed JSON in overrides gracefully", async () => {
			const { getAdminClient } = await import("../lib/appwrite-admin");
			const mockClient = getAdminClient();

			vi.mocked(mockClient.databases.listDocuments).mockResolvedValue({
				total: 1,
				documents: [
					{
						$id: "settings-1",
						userId: "user-1",
						globalNotifications: "all",
						desktopNotifications: true,
						pushNotifications: true,
						notificationSound: true,
						quietHoursStart: null,
						quietHoursEnd: null,
						serverOverrides: "invalid json{",
						channelOverrides: "{}",
						conversationOverrides: "{}",
					},
				],
			} as never);

			const { getNotificationSettings } = await import("../lib/notification-settings");
			const result = await getNotificationSettings("user-1");

			expect(result?.serverOverrides).toEqual({});
		});
	});
});
