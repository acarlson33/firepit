import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import type { Server } from "@/lib/types";
import { listPages } from "@/lib/appwrite-pagination";
import { getActualMemberCounts } from "@/lib/membership-count";
import { mapServerDocument } from "@/lib/server-metadata";

type MembershipDocument = {
    serverId: string;
};

type ServerDocument = Record<string, unknown> & {
    $id: string;
};

const selectMembershipFieldQuery = (): string[] => [
    Query.select(["$id", "serverId"]),
];

const QUERY_ARRAY_LIMIT = 100;

function chunkValues<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

function isMembershipDocument(document: unknown): document is MembershipDocument {
    if (!document || typeof document !== "object") {
        return false;
    }

    const candidate = document as Record<string, unknown>;
    return typeof candidate.serverId === "string";
}

/**
 * GET /api/servers
 * Lists servers with pagination
 * Query params:
 *   - limit: number of servers to return (default: 25)
 *   - cursor: cursor for pagination
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const parsedLimit = Number.parseInt(
            searchParams.get("limit") || "25",
            10,
        );
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 25;
        const cursor = searchParams.get("cursor");

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const loadServerIds = async () => {
            const pageSize = 100;
            const membershipFields = selectMembershipFieldQuery();
            const serverIds = new Set<string>();

            const { documents, truncated } = await listPages({
                databases,
                databaseId: env.databaseId,
                collectionId: env.collections.memberships,
                baseQueries: [Query.equal("userId", session.$id), ...membershipFields],
                pageSize,
                maxPages: 50,
                warningContext: "loadServerIds",
            });

            for (const document of documents) {
                if (!isMembershipDocument(document)) {
                    continue;
                }
                if (document.serverId.length > 0) {
                    serverIds.add(document.serverId);
                }
            }

            return {
                serverIds: Array.from(serverIds),
                truncated,
            };
        };

        const { serverIds, truncated } = await loadServerIds();

        if (serverIds.length === 0) {
            return NextResponse.json(
                {
                    servers: [] as Server[],
                    nextCursor: null,
                    truncated,
                },
                {
                    headers: {
                        "Cache-Control": "private, no-store",
                    },
                },
            );
        }

        const serverChunks = chunkValues(serverIds, QUERY_ARRAY_LIMIT);
        const pages = await Promise.all(
            serverChunks.map((ids) =>
                databases.listDocuments(
                    env.databaseId,
                    env.collections.servers,
                    [
                        Query.equal("$id", ids),
                        Query.orderAsc("$createdAt"),
                    ],
                ),
            ),
        );

        const serversById = new Map<string, ServerDocument>();
        for (const page of pages) {
            for (const doc of page.documents) {
                serversById.set(
                    String(doc.$id),
                    doc as unknown as ServerDocument,
                );
            }
        }

        // Appwrite's cursorAfter applies per-query, so pagination over a
        // multi-query result is done in memory on the merged, deduped set.
        let pageDocuments = Array.from(serversById.values()).sort((a, b) =>
            String(a.$createdAt).localeCompare(String(b.$createdAt)),
        );
        if (cursor) {
            const cursorIndex = pageDocuments.findIndex(
                (doc) => doc.$id === cursor,
            );
            if (cursorIndex !== -1) {
                pageDocuments = pageDocuments.slice(cursorIndex + 1);
            }
        }

        const pageForResponse = pageDocuments.slice(0, limit);
        const listedServerIds = pageForResponse.map((doc) => String(doc.$id));
        const memberCounts = await getActualMemberCounts(
            databases,
            listedServerIds,
        );

        const servers: Server[] = pageForResponse.map((doc) =>
            mapServerDocument(
                doc,
                memberCounts.counts.get(String(doc.$id)) ?? 0,
            ),
        );

        const last = servers.at(-1);
        const nextCursor =
            pageDocuments.length > limit && last ? last.$id : null;

        return NextResponse.json(
            {
                servers,
                nextCursor,
                truncated,
            },
            {
                headers: {
                    "Cache-Control": "private, no-store",
                },
            },
        );
    } catch (error) {
        logger.error("Failed to fetch servers", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch servers" },
            { status: 500 },
        );
    }
}
