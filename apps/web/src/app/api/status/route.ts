import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { createHash } from "node:crypto";

import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
    addTransactionAttributes,
    recordEvent,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import {
    ALLOWED_STATUSES,
    normalizeStatus,
    statusBatchCacheKey,
} from "@/lib/status-normalization";
import { apiCache } from "@/lib/cache-utils";
import type { UserStatus } from "@/lib/types";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const STATUSES_COLLECTION = env.collections.statuses;
const STATUS_ROUTE_CACHE_TTL_MS = 5 * 1000;

function canUseStatusRouteCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function statusSingleCacheKey(userId: string): string {
    return `api:status:single:${userId}`;
}

function dedupeStatusRouteCache<T>(key: string, fetcher: () => Promise<T>) {
    if (!canUseStatusRouteCache()) {
        return fetcher();
    }

    return apiCache.dedupe(key, fetcher, STATUS_ROUTE_CACHE_TTL_MS);
}

function hashUserId(userId: string): string {
    return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

function isAlreadyExistsConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

function statusDocumentData(params: {
    customMessage?: unknown;
    expiresAt?: unknown;
    isManuallySet?: unknown;
    now: string;
    status: UserStatus["status"];
}) {
    return {
        status: params.status,
        customMessage: params.customMessage || null,
        lastSeenAt: params.now,
        expiresAt: params.expiresAt || null,
        isManuallySet: params.isManuallySet || false,
    };
}

/**
 * Set or update user status (server-side)
 */
export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        setTransactionName("POST /api/status");

        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { userId, status, customMessage, expiresAt, isManuallySet } =
            await request.json();

        if (!userId || !status) {
            logger.warn("Invalid status request", { userId, status });
            return NextResponse.json(
                { error: "userId and status are required" },
                { status: 400 },
            );
        }

        if (userId !== session.$id) {
            return returnForbidden();
        }

        if (!ALLOWED_STATUSES.has(status as UserStatus["status"])) {
            return NextResponse.json(
                { error: "Invalid status value" },
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
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const hashedUserId = hashUserId(userId);

        // Try to find existing status document
        const dbStartTime = Date.now();
        const existing = await databases.listDocuments(
            DATABASE_ID,
            STATUSES_COLLECTION,
            [Query.equal("userId", userId), Query.limit(1)],
        );

        trackApiCall("/api/status", "GET", 200, Date.now() - dbStartTime, {
            operation: "listDocuments",
            collection: "statuses",
        });

        // Check if status has expired
        let shouldUpdate = true;
        if (existing.documents.length > 0) {
            const doc = existing.documents[0];
            const docExpiresAt = doc.expiresAt as string | undefined;
            const docIsManuallySet = doc.isManuallySet as boolean | undefined;

            // If there's an active manually-set status that hasn't expired, don't overwrite with auto-status
            if (docIsManuallySet && !isManuallySet) {
                const expirationDate = docExpiresAt
                    ? new Date(docExpiresAt)
                    : null;

                if (!expirationDate || expirationDate > nowDate) {
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
                statusDocumentData({
                    customMessage,
                    expiresAt,
                    isManuallySet,
                    now,
                    status,
                }),
                perms.serverOwner(userId),
            );

            trackApiCall(
                "/api/status",
                "POST",
                200,
                Date.now() - updateStartTime,
                { operation: "updateDocument", action: "update" },
            );

            recordEvent("StatusUpdate", {
                userId: hashedUserId,
                status,
                action: "updated",
                isManuallySet: !!isManuallySet,
            });

            logger.info("Status updated", {
                userId: hashedUserId,
                status,
                duration: Date.now() - startTime,
            });

            return NextResponse.json(normalizeStatus(updated).normalized);
        }

        if (existing.documents.length > 0 && !shouldUpdate) {
            logger.info("Status not updated - manual status still active", {
                userId: hashedUserId,
            });
            // Return existing status without updating
            return NextResponse.json(
                normalizeStatus(existing.documents[0]).normalized,
            );
        }

        // Create new status document with a deterministic id so concurrent
        // creates for the same user resolve to the same document.
        const createStartTime = Date.now();
        const docId = userId.slice(0, 36);
        const data = statusDocumentData({
            customMessage,
            expiresAt,
            isManuallySet,
            now,
            status,
        });

        let created: Awaited<ReturnType<typeof databases.createDocument>>;
        try {
            created = await databases.createDocument(
                DATABASE_ID,
                STATUSES_COLLECTION,
                docId,
                data,
                perms.serverOwner(userId),
            );
        } catch (error) {
            if (!isAlreadyExistsConflict(error)) {
                throw error;
            }

            // A concurrent request created the document first; update it instead.
            const winnerResult = await databases.listDocuments(
                DATABASE_ID,
                STATUSES_COLLECTION,
                [Query.equal("userId", userId), Query.limit(1)],
            );
            const winner = winnerResult.documents[0];
            if (!winner) {
                throw error;
            }

            created = await databases.updateDocument(
                DATABASE_ID,
                STATUSES_COLLECTION,
                winner.$id,
                data,
                perms.serverOwner(userId),
            );
        }

        trackApiCall("/api/status", "POST", 200, Date.now() - createStartTime, {
            operation: "createDocument",
            action: "create",
        });

        recordEvent("StatusUpdate", {
            userId: hashedUserId,
            status,
            action: "created",
            isManuallySet: !!isManuallySet,
        });

        logger.info("Status created", {
            userId: hashedUserId,
            status,
            duration: Date.now() - startTime,
        });

        return NextResponse.json(normalizeStatus(created).normalized);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/status",
            endpoint: "/api/status",
        });

        logger.error("Failed to set status", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return NextResponse.json(
            { error: "Failed to set user status" },
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

        const cacheHeaders = {
            headers: {
                "Cache-Control":
                    "public, s-maxage=15, stale-while-revalidate=60",
            },
        } as const;

        if (!STATUSES_COLLECTION) {
            return NextResponse.json(
                { error: "Statuses collection not configured" },
                { status: 500 },
            );
        }

        const { databases } = getServerClient();

        // Single user query
        if (userId) {
            const existing = await dedupeStatusRouteCache(
                statusSingleCacheKey(userId),
                () =>
                    databases.listDocuments(DATABASE_ID, STATUSES_COLLECTION, [
                        Query.equal("userId", userId),
                        Query.limit(1),
                    ]),
            );

            if (existing.documents.length === 0) {
                return NextResponse.json({ status: null }, cacheHeaders);
            }

            const { normalized } = normalizeStatus(existing.documents[0]);

            return NextResponse.json(normalized, cacheHeaders);
        }

        // Multiple users query
        if (userIds) {
            const userIdList = userIds.split(",").filter(Boolean);
            if (userIdList.length === 0) {
                return NextResponse.json({ statuses: [] }, cacheHeaders);
            }

            // Note: Limited to 100 users per request for performance.
            // For larger batches, consider pagination or multiple requests.
            const existing = await dedupeStatusRouteCache(
                statusBatchCacheKey(userIdList),
                () =>
                    databases.listDocuments(DATABASE_ID, STATUSES_COLLECTION, [
                        Query.equal("userId", userIdList),
                        Query.limit(100),
                    ]),
            );

            const normalizedStatuses = existing.documents.map(
                (doc) => normalizeStatus(doc).normalized,
            );

            return NextResponse.json(
                { statuses: normalizedStatuses },
                cacheHeaders,
            );
        }

        return NextResponse.json(
            { error: "userId or userIds parameter is required" },
            { status: 400 },
        );
    } catch (error) {
        logger.error("Error in GET /api/status", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to get user status" },
            { status: 500 },
        );
    }
}

/**
 * Update last seen timestamp (server-side)
 */
export async function PATCH(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json(
                { error: "userId is required" },
                { status: 400 },
            );
        }

        if (userId !== session.$id) {
            return returnForbidden();
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
        logger.error("Error in PATCH /api/status", {
            error: error instanceof Error ? error.message : String(error),
        });
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
        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json(
                { error: "userId is required" },
                { status: 400 },
            );
        }

        if (userId !== session.$id) {
            return returnForbidden();
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
        logger.error("Error in DELETE /api/status", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to delete user status" },
            { status: 500 },
        );
    }
}
