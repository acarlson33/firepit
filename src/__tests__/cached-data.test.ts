import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheLife } from "next/cache";
import {
	getCachedUserProfile,
	getCachedAvatarUrl,
	getCachedUserRoleTags,
	getCachedBasicStats,
	getCachedServersPage,
	getCachedChannelsPage,
} from "../lib/cached-data";

const mockGetUserProfile = vi.fn();
const mockGetAvatarUrl = vi.fn();
const mockGetUserRoleTags = vi.fn();
const mockGetBasicStats = vi.fn();
const mockListAllServersPage = vi.fn();
const mockListAllChannelsPage = vi.fn();

vi.mock("next/cache", () => ({
	cacheLife: vi.fn(),
}));

vi.mock("../lib/appwrite-profiles", () => ({
	getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
	getAvatarUrl: (...args: unknown[]) => mockGetAvatarUrl(...args),
}));

vi.mock("../lib/appwrite-roles", () => ({
	getUserRoleTags: (...args: unknown[]) => mockGetUserRoleTags(...args),
}));

vi.mock("../lib/appwrite-admin", () => ({
	getBasicStats: (...args: unknown[]) => mockGetBasicStats(...args),
	listAllServersPage: (...args: unknown[]) => mockListAllServersPage(...args),
	listAllChannelsPage: (...args: unknown[]) => mockListAllChannelsPage(...args),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("cached-data helpers", () => {
	it("caches user profile lookups for minutes", async () => {
		mockGetUserProfile.mockResolvedValue({ $id: "user-1" });

		const result = await getCachedUserProfile("user-1");

		expect(cacheLife).toHaveBeenCalledWith("minutes");
		expect(mockGetUserProfile).toHaveBeenCalledWith("user-1");
		expect(result).toEqual({ $id: "user-1" });
	});

	it("caches avatar URLs for hours", async () => {
		mockGetAvatarUrl.mockResolvedValue("https://example.com/avatar.png");

		const result = await getCachedAvatarUrl("file-123");

		expect(cacheLife).toHaveBeenCalledWith("hours");
		expect(mockGetAvatarUrl).toHaveBeenCalledWith("file-123");
		expect(result).toBe("https://example.com/avatar.png");
	});

	it("caches role tags for minutes", async () => {
		mockGetUserRoleTags.mockResolvedValue(["admin"]);

		const result = await getCachedUserRoleTags("user-2");

		expect(cacheLife).toHaveBeenCalledWith("minutes");
		expect(mockGetUserRoleTags).toHaveBeenCalledWith("user-2");
		expect(result).toEqual(["admin"]);
	});

	it("caches basic stats for seconds", async () => {
		mockGetBasicStats.mockResolvedValue({ servers: 5 });

		const result = await getCachedBasicStats();

		expect(cacheLife).toHaveBeenCalledWith("seconds");
		expect(mockGetBasicStats).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ servers: 5 });
	});

	it("caches server pagination for minutes", async () => {
		mockListAllServersPage.mockResolvedValue({ servers: [] });

		const result = await getCachedServersPage(25, "cursor-1");

		expect(cacheLife).toHaveBeenCalledWith("minutes");
		expect(mockListAllServersPage).toHaveBeenCalledWith(25, "cursor-1");
		expect(result).toEqual({ servers: [] });
	});

	it("caches channel pagination for minutes", async () => {
		mockListAllChannelsPage.mockResolvedValue({ channels: [] });

		const result = await getCachedChannelsPage("server-1", 10, "cursor-2");

		expect(cacheLife).toHaveBeenCalledWith("minutes");
		expect(mockListAllChannelsPage).toHaveBeenCalledWith("server-1", 10, "cursor-2");
		expect(result).toEqual({ channels: [] });
	});
});
