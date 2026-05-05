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

        const membershipsResponse = await databases.listDocuments(
            env.databaseId,
            env.collections.memberships,
            [Query.equal("userId", session.$id), Query.limit(1000)],
        );

        const serverIds = Array.from(
            new Set(
                membershipsResponse.documents.map((document) =>
                    String((document as { serverId?: unknown }).serverId ?? ""),
                ),
            ),
        ).filter((id) => id.length > 0);

        if (serverIds.length === 0) {
            return compressedResponse(
                {
                    servers: [] as Server[],
                    nextCursor: null,
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

        const res = await databases.listDocuments(
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
                doc as unknown as Record<string, unknown>,
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
