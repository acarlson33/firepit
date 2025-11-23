import { NextResponse, type NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * GET /api/servers/public?cursor=lastServerId&limit=25
 * Returns a list of all public servers for browsing/joining with pagination
 */
export async function GET(request: NextRequest) {
	try {
		const env = getEnvConfig();
		const { databases } = getServerClient();

		const { searchParams } = new URL(request.url);
		const cursor = searchParams.get("cursor");
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "25", 10), 100);

		const queries = [Query.limit(limit + 1), Query.orderDesc("$createdAt")];
		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		const response = await databases.listDocuments(
			env.databaseId,
			env.collections.servers,
			queries
		);

		const hasMore = response.documents.length > limit;
		const items = hasMore ? response.documents.slice(0, limit) : response.documents;

		const servers = items.map((doc) => ({
			$id: doc.$id,
			name: String(doc.name),
			ownerId: String(doc.ownerId),
			memberCount: typeof doc.memberCount === 'number' ? doc.memberCount : undefined,
		}));

		const nextCursor = hasMore ? items.at(-1)?.$id : undefined;

		return NextResponse.json({ servers, nextCursor, hasMore });
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
