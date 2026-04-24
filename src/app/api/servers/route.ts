import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Server } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";
import { getActualMemberCounts } from "@/lib/membership-count";
import { mapServerDocument } from "@/lib/server-metadata";
import { logger } from "@/lib/newrelic-utils";

type ListDocumentsResponse = Awaited<
    ReturnType<ReturnType<typeof getServerClient>["databases"]["listDocuments"]>
>;

type MembershipDocument = {
    serverId: string;
};

type ServerDocument = Record<string, unknown> & {
    $id: string;
};

type QueryWithSelect = typeof Query & {
    select?: (attributes: string[]) => string;
};

const selectMembershipFieldQuery = () => {
    const queryWithSelect = Query as QueryWithSelect;
    return typeof queryWithSelect.select === "function"
        ? [queryWithSelect.select(["$id", "serverId"])]
        : [];
};

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
        const limit = Number.parseInt(searchParams.get("limit") || "25", 10);
        const cursor = searchParams.get("cursor");

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const loadServerIds = async () => {
            const pageSize = 100;
            const membershipFields = selectMembershipFieldQuery();
            const serverIds = new Set<string>();

            const { documents, truncated } = await import("@/lib/appwrite-pagination").then((m) =>
                m.listPages({
                    databases,
                    databaseId: env.databaseId,
                    collectionId: env.collections.memberships,
                    baseQueries: [Query.equal("userId", session.$id), ...membershipFields],
                    pageSize,
                    maxPages: 50,
                    warningContext: "loadServerIds",
                }),
            );

            for (const document of documents) {
                if (!isMembershipDocument(document)) continue;
                if (document.serverId.length > 0) serverIds.add(document.serverId);
            }

            return {
                serverIds: Array.from(serverIds),
                truncated,
            };
        };

        const { serverIds, truncated } = await loadServerIds();

        if (serverIds.length === 0) {
            return compressedResponse(
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

        const queries: string[] = [
            Query.equal("$id", serverIds),
            Query.limit(limit),
            Query.orderAsc("$createdAt"),
        ];

        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        const res: ListDocumentsResponse = await databases.listDocuments(
            env.databaseId,
            env.collections.servers,
            queries,
        );

        const listedServerIds = res.documents.map((doc) => String(doc.$id));
        const memberCounts = await getActualMemberCounts(
            databases,
            listedServerIds,
        );

        const servers: Server[] = res.documents.map((doc) =>
            mapServerDocument(
                doc as ServerDocument,
                memberCounts.get(String(doc.$id)) ?? 0,
            ),
        );

        const last = servers.at(-1);
        const nextCursor = servers.length === limit && last ? last.$id : null;

        // Use compressed response for large payloads (60-70% bandwidth reduction)
        const response = compressedResponse(
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

        return response;
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch servers",
            },
            { status: 500 },
        );
    }
}
