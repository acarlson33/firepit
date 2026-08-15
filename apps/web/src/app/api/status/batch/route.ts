import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { apiCache } from "@/lib/cache-utils";
import {
    logger,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
    returnUnauthorized,
} from "@/lib/newrelic-utils";
import type { UserStatus } from "@/lib/types";
import {
    normalizeStatus,
    statusBatchCacheKey,
} from "@/lib/status-normalization";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;

const STATUS_BATCH_CACHE_TTL_MS = 30_000;
const MAX_BATCH_USER_IDS = 1000;

/**
 * Batch fetch user statuses
 */
export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/status/batch");

        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { userIds } = await request.json();

        if (!Array.isArray(userIds) || userIds.length === 0) {
            logger.warn("Invalid batch status request", { userIds });
            return NextResponse.json(
                { error: "userIds array is required" },
                { status: 400 },
            );
        }

        if (userIds.length > MAX_BATCH_USER_IDS) {
            logger.warn("Batch status request exceeds max user count", {
                requestedCount: userIds.length,
            });
            return NextResponse.json(
                {
                    error: `userIds must contain at most ${MAX_BATCH_USER_IDS} entries`,
                },
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

        const cacheKey = statusBatchCacheKey(userIds);
        const allStatuses = await apiCache.dedupe(
            cacheKey,
            async () => {
                const { databases } = getServerClient();
                const batchSize = 100;
                const result: Record<string, UserStatus> = {};

                for (let i = 0; i < userIds.length; i += batchSize) {
                    const batch = userIds.slice(i, i + batchSize);
                    const dbStartTime = Date.now();

                    const response = await databases.listDocuments(
                        DATABASE_ID,
                        STATUSES_COLLECTION,
                        [
                            Query.equal("userId", batch),
                            Query.limit(batch.length),
                        ],
                    );

                    trackApiCall(
                        "statusBatch.listStatuses",
                        "POST",
                        200,
                        Date.now() - dbStartTime,
                        { operation: "listDocuments", batchSize: batch.length },
                    );

                    for (const doc of response.documents) {
                        const { normalized } = normalizeStatus(doc);
                        result[normalized.userId] = normalized;
                    }
                }

                return result;
            },
            STATUS_BATCH_CACHE_TTL_MS,
        );

        logger.info("Batch status fetch completed", {
            requestedCount: userIds.length,
            foundCount: Object.keys(allStatuses).length,
            duration: Date.now() - startTime,
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
