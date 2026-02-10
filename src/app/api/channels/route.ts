import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Channel } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";

/**
 * GET /api/channels
 * Lists channels for a specific server with pagination
 * Query params:
 *   - serverId: server ID (required)
 *   - limit: number of channels to return (default: 50)
 *   - cursor: cursor for pagination
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const serverId = searchParams.get("serverId");
        const parsedLimit = Number.parseInt(
            searchParams.get("limit") || "50",
            10,
        );
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 50;
        const cursor = searchParams.get("cursor");

        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        const queries: string[] = [
            Query.equal("serverId", serverId),
            Query.limit(limit),
            Query.orderAsc("$createdAt"),
        ];

        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        const res = await databases.listDocuments(
            env.databaseId,
            env.collections.channels,
            queries,
        );

        const channels: Channel[] = res.documents.map((doc) => {
            const d = doc as unknown as Record<string, unknown>;
            return {
                $id: String(d.$id),
                serverId: String(d.serverId),
                name: String(d.name),
                $createdAt: String(d.$createdAt ?? ""),
            } satisfies Channel;
        });

        const last = channels.at(-1);
        const nextCursor = channels.length === limit && last ? last.$id : null;

        // Use compressed response for large payloads (60-70% bandwidth reduction)
        const response = compressedResponse(
            {
                channels,
                nextCursor,
            },
            {
                headers: {
                    // Cache channels for 60 seconds with 5 minute stale-while-revalidate
                    "Cache-Control":
                        "public, s-maxage=60, stale-while-revalidate=300",
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
                        : "Failed to fetch channels",
            },
            { status: 500 },
        );
    }
}
