import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient, getEnvConfig } from "@/lib/appwrite-core";
import {
	logger,
	setTransactionName,
	trackApiCall,
	addTransactionAttributes,
} from "@/lib/newrelic-utils";
import type { UserStatus } from "@/lib/types";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;

/**
 * Batch fetch user statuses
 */
export async function POST(request: Request) {
	const startTime = Date.now();
	
	try {
		setTransactionName("POST /api/status/batch");
		
		const { userIds } = await request.json();

		if (!Array.isArray(userIds) || userIds.length === 0) {
			logger.warn("Invalid batch status request", { userIds });
			return NextResponse.json(
				{ error: "userIds array is required" },
				{ status: 400 },
			);
		}
		
		addTransactionAttributes({
			userCount: userIds.length,
		});

		if (!STATUSES_COLLECTION) {
			logger.error("Statuses collection not configured");
			return NextResponse.json(
				{ error: "Statuses collection not configured" },
				{ status: 500 },
			);
		}

		const { databases } = getServerClient();

		// Fetch statuses for all requested users
		// Appwrite limits to 100 items in Query.equal array, so we need to batch if needed
		const batchSize = 100;
		const allStatuses: Record<string, UserStatus> = {};

		for (let i = 0; i < userIds.length; i += batchSize) {
			const batch = userIds.slice(i, i + batchSize);
			const dbStartTime = Date.now();
			
			const response = await databases.listDocuments(
				DATABASE_ID,
				STATUSES_COLLECTION,
				[Query.equal("userId", batch)],
			);
			
			trackApiCall(
				"/api/status/batch",
				"GET",
				200,
				Date.now() - dbStartTime,
				{ operation: "listDocuments", batchSize: batch.length }
			);

			// Map documents to status objects
			for (const doc of response.documents) {
				const userId = String(doc.userId);
				allStatuses[userId] = {
					$id: String(doc.$id),
					userId,
					status: String(doc.status) as "online" | "away" | "busy" | "offline",
					customMessage: doc.customMessage ? String(doc.customMessage) : undefined,
					lastSeenAt: String(doc.lastSeenAt),
					expiresAt: doc.expiresAt ? String(doc.expiresAt) : undefined,
					isManuallySet: doc.isManuallySet ? Boolean(doc.isManuallySet) : undefined,
					$updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
				};
			}
		}
		
		logger.info("Batch status fetch completed", { 
			requestedCount: userIds.length,
			foundCount: Object.keys(allStatuses).length,
			duration: Date.now() - startTime 
		});

		return NextResponse.json({ statuses: allStatuses });
	} catch (error) {
		logger.error("Batch status fetch failed", { error });
		return NextResponse.json(
			{ error: "Failed to fetch statuses" },
			{ status: 500 },
		);
	}
}
