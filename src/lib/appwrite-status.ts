import { Query } from "appwrite";

import type { UserStatus } from "./types";
import { getBrowserDatabases, getEnvConfig } from "./appwrite-core";

function getConfig() {
	return getEnvConfig();
}

function getDatabases() {
	return getBrowserDatabases();
}

/**
 * Set or update user status (via server API)
 */
export async function setUserStatus(
	userId: string,
	status: "online" | "away" | "busy" | "offline",
	customMessage?: string,
	expiresAt?: string,
	isManuallySet?: boolean,
): Promise<UserStatus> {
	const env = getConfig();
	const STATUSES_COLLECTION = env.collections.statuses;
	
	if (!STATUSES_COLLECTION) {
		throw new Error("Statuses collection not configured");
	}

	const response = await fetch("/api/status", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			userId,
			status,
			customMessage,
			expiresAt,
			isManuallySet,
		}),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		console.error("Failed to set user status:", response.status, errorData);
		throw new Error(errorData.details || errorData.error || "Failed to set user status");
	}

	const data = await response.json();
	return {
		$id: String(data.$id),
		userId: String(data.userId),
		status: String(data.status) as "online" | "away" | "busy" | "offline",
		customMessage: data.customMessage ? String(data.customMessage) : undefined,
		lastSeenAt: String(data.lastSeenAt),
		expiresAt: data.expiresAt ? String(data.expiresAt) : undefined,
		isManuallySet: Boolean(data.isManuallySet),
		$updatedAt: data.$updatedAt ? String(data.$updatedAt) : undefined,
	};
}

/**
 * Get status for a single user
 */
export async function getUserStatus(
	userId: string,
): Promise<UserStatus | null> {
	const env = getConfig();
	const DATABASE_ID = env.databaseId;
	const STATUSES_COLLECTION = env.collections.statuses;
	
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
			expiresAt: doc.expiresAt ? String(doc.expiresAt) : undefined,
			isManuallySet: doc.isManuallySet ? Boolean(doc.isManuallySet) : undefined,
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
	const env = getConfig();
	const DATABASE_ID = env.databaseId;
	const STATUSES_COLLECTION = env.collections.statuses;
	
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
				expiresAt: d.expiresAt ? String(d.expiresAt) : undefined,
				isManuallySet: d.isManuallySet ? Boolean(d.isManuallySet) : undefined,
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
 * Update last seen timestamp (via server API)
 */
export async function updateLastSeen(userId: string): Promise<void> {
	const env = getConfig();
	const STATUSES_COLLECTION = env.collections.statuses;
	
	if (!STATUSES_COLLECTION) {
		return;
	}

	try {
		await fetch("/api/status", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ userId }),
		});
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
