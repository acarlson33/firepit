import { NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient, getEnvConfig, perms } from "@/lib/appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;

/**
 * Set or update user status (server-side)
 */
export async function POST(request: Request) {
	try {
		const { userId, status, customMessage, expiresAt, isManuallySet } = await request.json();

		if (!userId || !status) {
			return NextResponse.json(
				{ error: "userId and status are required" },
				{ status: 400 },
			);
		}

		if (!STATUSES_COLLECTION) {
			return NextResponse.json(
				{ error: "Statuses collection not configured" },
				{ status: 500 },
			);
		}

		const { databases } = getServerClient();
		const now = new Date().toISOString();

		// Try to find existing status document
		const existing = await databases.listDocuments(
			DATABASE_ID,
			STATUSES_COLLECTION,
			[Query.equal("userId", userId), Query.limit(1)],
		);

		// Check if status has expired
		let shouldUpdate = true;
		if (existing.documents.length > 0) {
			const doc = existing.documents[0];
			const docExpiresAt = doc.expiresAt as string | undefined;
			const docIsManuallySet = doc.isManuallySet as boolean | undefined;
			
			// If there's an active manually-set status that hasn't expired, don't overwrite with auto-status
			if (docIsManuallySet && !isManuallySet && docExpiresAt) {
				const expirationDate = new Date(docExpiresAt);
				if (expirationDate > new Date()) {
					// Don't overwrite - manually set status is still active
					shouldUpdate = false;
				}
			}
		}

		if (existing.documents.length > 0 && shouldUpdate) {
			// Update existing
			const doc = existing.documents[0];
			const updated = await databases.updateDocument(
				DATABASE_ID,
				STATUSES_COLLECTION,
				doc.$id,
				{
					status,
					customMessage: customMessage || null,
					lastSeenAt: now,
					expiresAt: expiresAt || null,
					isManuallySet: isManuallySet || false,
				},
				perms.serverOwner(userId),
			);

			return NextResponse.json(updated);
		}

		if (existing.documents.length > 0 && !shouldUpdate) {
			// Return existing status without updating
			return NextResponse.json(existing.documents[0]);
		}

		// Create new status document
		const created = await databases.createDocument(
			DATABASE_ID,
			STATUSES_COLLECTION,
			ID.unique(),
			{
				userId,
				status,
				customMessage: customMessage || null,
				lastSeenAt: now,
				expiresAt: expiresAt || null,
				isManuallySet: isManuallySet || false,
			},
			perms.serverOwner(userId),
		);

		return NextResponse.json(created);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to set user status" },
			{ status: 500 },
		);
	}
}

/**
 * Update last seen timestamp (server-side)
 */
export async function PATCH(request: Request) {
	try {
		const { userId } = await request.json();

		if (!userId) {
			return NextResponse.json(
				{ error: "userId is required" },
				{ status: 400 },
			);
		}

		if (!STATUSES_COLLECTION) {
			return NextResponse.json(
				{ error: "Statuses collection not configured" },
				{ status: 500 },
			);
		}

		const { databases } = getServerClient();

		// Find existing status document
		const existing = await databases.listDocuments(
			DATABASE_ID,
			STATUSES_COLLECTION,
			[Query.equal("userId", userId), Query.limit(1)],
		);

		if (existing.documents.length > 0) {
			const doc = existing.documents[0];
			await databases.updateDocument(
				DATABASE_ID,
				STATUSES_COLLECTION,
				doc.$id,
				{
					lastSeenAt: new Date().toISOString(),
				},
				perms.serverOwner(userId),
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to update last seen" },
			{ status: 500 },
		);
	}
}
