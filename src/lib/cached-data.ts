"use cache";

/**
 * Cached data fetching utilities
 * These functions use Next.js 16's "use cache" directive for optimal performance
 * 
 * Cache durations:
 * - Profile data: 5 minutes (profiles don't change frequently)
 * - Avatar URLs: 1 hour (file IDs are immutable)
 * - Role tags: 5 minutes (role assignments are relatively stable)
 * - Stats: 1 minute (stats are expensive to compute)
 * - Server/Channel lists: 5 minutes (relatively static data)
 */

import { cacheLife } from "next/cache";
import { getUserProfile as _getUserProfile, getAvatarUrl as _getAvatarUrl } from "./appwrite-profiles";
import { getUserRoleTags as _getUserRoleTags } from "./appwrite-roles";
import { getBasicStats as _getBasicStats, listAllServersPage as _listAllServersPage, listAllChannelsPage as _listAllChannelsPage } from "./appwrite-admin";

/**
 * Get a user's profile with caching
 * Profiles don't change frequently, so they're good candidates for caching
 */
export async function getCachedUserProfile(userId: string) {
	"use cache";
	cacheLife("minutes");
	return _getUserProfile(userId);
}

/**
 * Get avatar URL with caching
 * Avatar URLs are deterministic based on fileId
 */
export async function getCachedAvatarUrl(fileId: string) {
	"use cache";
	cacheLife("hours");
	return _getAvatarUrl(fileId);
}

/**
 * Get user role tags with caching
 * Role assignments don't change frequently
 */
export async function getCachedUserRoleTags(userId: string) {
	"use cache";
	cacheLife("minutes");
	return _getUserRoleTags(userId);
}

/**
 * Get basic stats with caching
 * Stats are expensive to compute and don't need real-time accuracy
 */
export async function getCachedBasicStats() {
	"use cache";
	cacheLife("seconds");
	return _getBasicStats();
}

/**
 * List servers with caching
 * Server lists are relatively static
 */
export async function getCachedServersPage(limit: number, cursor?: string) {
	"use cache";
	cacheLife("minutes");
	return _listAllServersPage(limit, cursor);
}

/**
 * List channels with caching
 * Channel lists are relatively static
 */
export async function getCachedChannelsPage(serverId: string, limit: number, cursor?: string) {
	"use cache";
	cacheLife("minutes");
	return _listAllChannelsPage(serverId, limit, cursor);
}
