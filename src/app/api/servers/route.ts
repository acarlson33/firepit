import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Server } from "@/lib/types";

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

		const servers: Server[] = res.documents.map((doc) => {
			const d = doc as unknown as Record<string, unknown>;
			return {
				$id: String(d.$id),
				name: String(d.name),
				$createdAt: String(d.$createdAt ?? ""),
				ownerId: String(d.ownerId),
			} satisfies Server;
		});

		const last = servers.at(-1);
		const nextCursor = servers.length === limit && last ? last.$id : null;

		return NextResponse.json({
			servers,
			nextCursor,
		});
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
