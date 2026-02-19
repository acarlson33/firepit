import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Server } from "@/lib/types";
import { compressedResponse } from "@/lib/api-compression";
import { getActualMemberCount } from "@/lib/membership-count";

/**
 * GET /api/servers
 * Lists servers with pagination
 * Query params:
 *   - limit: number of servers to return (default: 25)
 *   - cursor: cursor for pagination
 */
export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const limit = Number.parseInt(searchParams.get("limit") || "25", 10);
		const cursor = searchParams.get("cursor");

		const env = getEnvConfig();
		const { databases } = getServerClient();

		const queries: string[] = [
			Query.limit(limit),
			Query.orderAsc("$createdAt"),
		];

		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		const res = await databases.listDocuments(
			env.databaseId,
			env.collections.servers,
			queries
		);

		// Enrich servers with actual member counts from memberships
		const servers: Server[] = await Promise.all(
			res.documents.map(async (doc) => {
				const d = doc as unknown as Record<string, unknown>;
				const actualCount = await getActualMemberCount(databases, String(d.$id));
				return {
					$id: String(d.$id),
					name: String(d.name),
					$createdAt: String(d.$createdAt ?? ""),
					ownerId: String(d.ownerId),
					memberCount: actualCount,
				} satisfies Server;
			})
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
					// Cache at edge and browser for 60 seconds, revalidate in background for 5 minutes
					// Reduces Appwrite API calls and improves perceived performance
					"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
				},
			}
		);

		return response;
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to fetch servers",
			},
			{ status: 500 }
		);
	}
}
