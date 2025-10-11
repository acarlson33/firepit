import { ID, Query, Permission, Role } from "appwrite";

import type { UserStatus } from "./types";
import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;

function getDatabases() {
	return getBrowserDatabases();
}

/**
 * Set or update user status
 */
export async function setUserStatus(
	userId: string,
	status: "online" | "away" | "busy" | "offline",
	customMessage?: string,
): Promise<UserStatus> {
	if (!STATUSES_COLLECTION) {
		throw new Error("Statuses collection not configured");
	}

	const now = new Date().toISOString();

	// Try to find existing status document
	try {
		const existing = await getDatabases().listDocuments({
			databaseId: DATABASE_ID,
			collectionId: STATUSES_COLLECTION,
			queries: [Query.equal("userId", userId), Query.limit(1)],
		});

		if (existing.documents.length > 0) {
			// Update existing
			const doc = existing.documents[0] as Record<string, unknown>;
			const updated = await getDatabases().updateDocument({
				databaseId: DATABASE_ID,
				collectionId: STATUSES_COLLECTION,
				documentId: String(doc.$id),
				data: {
					status,
					customMessage: customMessage || null,
					lastSeenAt: now,
				},
			});

			const u = updated as unknown as Record<string, unknown>;
			return {
				$id: String(u.$id),
				userId: String(u.userId),
				status: String(u.status) as "online" | "away" | "busy" | "offline",
				customMessage: u.customMessage ? String(u.customMessage) : undefined,
				lastSeenAt: String(u.lastSeenAt),
				$updatedAt: u.$updatedAt ? String(u.$updatedAt) : undefined,
			};
		}
	} catch {
		// Continue to create new status
	}

	// Create new status document
	const permissions = [
		Permission.read(Role.any()),
		Permission.update(Role.user(userId)),
		Permission.delete(Role.user(userId)),
	];

	const created = await getDatabases().createDocument({
		databaseId: DATABASE_ID,
		collectionId: STATUSES_COLLECTION,
		documentId: ID.unique(),
		data: {
			userId,
			status,
			customMessage: customMessage || null,
			lastSeenAt: now,
		},
		permissions,
	});

	const c = created as unknown as Record<string, unknown>;
	return {
		$id: String(c.$id),
		userId: String(c.userId),
		status: String(c.status) as "online" | "away" | "busy" | "offline",
		customMessage: c.customMessage ? String(c.customMessage) : undefined,
		lastSeenAt: String(c.lastSeenAt),
		$updatedAt: c.$updatedAt ? String(c.$updatedAt) : undefined,
	};
}

/**
 * Get status for a single user
 */
export async function getUserStatus(
	userId: string,
): Promise<UserStatus | null> {
	if (!STATUSES_COLLECTION) {
		return null;
	}

	try {
		const response = await getDatabases().listDocuments({
			databaseId: DATABASE_ID,
			collectionId: STATUSES_COLLECTION,
			queries: [Query.equal("userId", userId), Query.limit(1)],
		});

		if (response.documents.length === 0) {
			return null;
		}

		const doc = response.documents[0] as Record<string, unknown>;
		return {
			$id: String(doc.$id),
			userId: String(doc.userId),
			status: String(doc.status) as "online" | "away" | "busy" | "offline",
			customMessage: doc.customMessage ? String(doc.customMessage) : undefined,
			lastSeenAt: String(doc.lastSeenAt),
			$updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
		};
	} catch {
		return null;
	}
}

/**
 * Get statuses for multiple users (batch fetch)
 */
export async function getUsersStatuses(
	userIds: string[],
): Promise<Map<string, UserStatus>> {
	if (!STATUSES_COLLECTION || userIds.length === 0) {
		return new Map();
	}

	try {
		const response = await getDatabases().listDocuments({
			databaseId: DATABASE_ID,
			collectionId: STATUSES_COLLECTION,
			queries: [Query.equal("userId", userIds), Query.limit(100)],
		});

		const statusMap = new Map<string, UserStatus>();
		for (const doc of response.documents) {
			const d = doc as Record<string, unknown>;
			const status: UserStatus = {
				$id: String(d.$id),
				userId: String(d.userId),
				status: String(d.status) as "online" | "away" | "busy" | "offline",
				customMessage: d.customMessage ? String(d.customMessage) : undefined,
				lastSeenAt: String(d.lastSeenAt),
				$updatedAt: d.$updatedAt ? String(d.$updatedAt) : undefined,
			};
			statusMap.set(status.userId, status);
		}

		return statusMap;
	} catch {
		return new Map();
	}
}

/**
 * Update last seen timestamp
 */
export async function updateLastSeen(userId: string): Promise<void> {
	if (!STATUSES_COLLECTION) {
		return;
	}

	try {
		const existing = await getDatabases().listDocuments({
			databaseId: DATABASE_ID,
			collectionId: STATUSES_COLLECTION,
			queries: [Query.equal("userId", userId), Query.limit(1)],
		});

		if (existing.documents.length > 0) {
			const doc = existing.documents[0] as Record<string, unknown>;
			await getDatabases().updateDocument({
				databaseId: DATABASE_ID,
				collectionId: STATUSES_COLLECTION,
				documentId: String(doc.$id),
				data: {
					lastSeenAt: new Date().toISOString(),
				},
			});
		}
	} catch {
		// Ignore errors for last seen updates
	}
}

/**
 * Set user offline
 */
export async function setOffline(userId: string): Promise<void> {
	await setUserStatus(userId, "offline");
}
