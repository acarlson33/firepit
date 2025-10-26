import { NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient, getEnvConfig, perms } from "@/lib/appwrite-core";
import {
	logger,
	recordError,
	setTransactionName,
	trackApiCall,
	addTransactionAttributes,
	recordEvent,
} from "@/lib/newrelic-utils";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;

/**
 * Set or update user status (server-side)
 */
export async function POST(request: Request) {
	const startTime = Date.now();
	
	try {
		setTransactionName("POST /api/status");
		
		const { userId, status, customMessage, expiresAt, isManuallySet } = await request.json();

		if (!userId || !status) {
			logger.warn("Invalid status request", { userId, status });
			return NextResponse.json(
				{ error: "userId and status are required" },
				{ status: 400 },
			);
		}
		
		addTransactionAttributes({
			userId,
			status,
			isManuallySet: !!isManuallySet,
		});

		if (!STATUSES_COLLECTION) {
			logger.error("Statuses collection not configured");
			return NextResponse.json(
				{ error: "Statuses collection not configured" },
				{ status: 500 },
			);
		}

		const { databases } = getServerClient();
		const now = new Date().toISOString();

		// Try to find existing status document
		const dbStartTime = Date.now();
		const existing = await databases.listDocuments(
			DATABASE_ID,
			STATUSES_COLLECTION,
			[Query.equal("userId", userId), Query.limit(1)],
		);
		
		trackApiCall(
			"/api/status",
			"GET",
			200,
			Date.now() - dbStartTime,
			{ operation: "listDocuments", collection: "statuses" }
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
			const updateStartTime = Date.now();
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
			
			trackApiCall(
				"/api/status",
				"POST",
				200,
				Date.now() - updateStartTime,
				{ operation: "updateDocument", action: "update" }
			);
			
			recordEvent("StatusUpdate", {
				userId,
				status,
				action: "updated",
				isManuallySet: !!isManuallySet,
			});
			
			logger.info("Status updated", { userId, status, duration: Date.now() - startTime });

			return NextResponse.json(updated);
		}

		if (existing.documents.length > 0 && !shouldUpdate) {
			logger.info("Status not updated - manual status still active", { userId });
			// Return existing status without updating
			return NextResponse.json(existing.documents[0]);
		}

		// Create new status document
		const createStartTime = Date.now();
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
		
		trackApiCall(
			"/api/status",
			"POST",
			200,
			Date.now() - createStartTime,
			{ operation: "createDocument", action: "create" }
		);
		
		recordEvent("StatusUpdate", {
			userId,
			status,
			action: "created",
			isManuallySet: !!isManuallySet,
		});
		
		logger.info("Status created", { userId, status, duration: Date.now() - startTime });

		return NextResponse.json(created);
	} catch (error) {
		recordError(
			error instanceof Error ? error : new Error(String(error)),
			{
				context: "POST /api/status",
				endpoint: "/api/status",
			}
		);
		
		logger.error("Failed to set status", {
			error: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		});
		
		return NextResponse.json(
			{ error: "Failed to set user status", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}

/**
 * Get user status(es) (server-side)
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("userId");
		const userIds = searchParams.get("userIds");

		if (!STATUSES_COLLECTION) {
			return NextResponse.json(
				{ error: "Statuses collection not configured" },
				{ status: 500 },
			);
		}

		const { databases } = getServerClient();

		// Single user query
		if (userId) {
			const existing = await databases.listDocuments(
				DATABASE_ID,
				STATUSES_COLLECTION,
				[Query.equal("userId", userId), Query.limit(1)],
			);

			if (existing.documents.length === 0) {
				return NextResponse.json({ status: null });
			}

			return NextResponse.json(existing.documents[0]);
		}

		// Multiple users query
		if (userIds) {
			const userIdList = userIds.split(",").filter(Boolean);
			if (userIdList.length === 0) {
				return NextResponse.json({ statuses: [] });
			}

			// Note: Limited to 100 users per request for performance.
			// For larger batches, consider pagination or multiple requests.
			const existing = await databases.listDocuments(
				DATABASE_ID,
				STATUSES_COLLECTION,
				[Query.equal("userId", userIdList), Query.limit(100)],
			);

			return NextResponse.json({ statuses: existing.documents });
		}

		return NextResponse.json(
			{ error: "userId or userIds parameter is required" },
			{ status: 400 },
		);
	} catch (error) {
		console.error("Error in GET /api/status:", error);
		return NextResponse.json(
			{ error: "Failed to get user status", details: error instanceof Error ? error.message : String(error) },
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
	} catch {
		return NextResponse.json(
			{ error: "Failed to update last seen" },
			{ status: 500 },
		);
	}
}

/**
 * Delete user status (server-side)
 */
export async function DELETE(request: Request) {
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

		if (existing.documents.length === 0) {
			return NextResponse.json(
				{ error: "Status not found" },
				{ status: 404 },
			);
		}

		const doc = existing.documents[0];
		await databases.deleteDocument(
			DATABASE_ID,
			STATUSES_COLLECTION,
			doc.$id,
		);

		return NextResponse.json({ success: true, deletedId: doc.$id });
	} catch (error) {
		console.error("Error in DELETE /api/status:", error);
		return NextResponse.json(
			{ error: "Failed to delete user status", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
