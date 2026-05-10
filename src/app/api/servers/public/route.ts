import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import type { NextRequest } from "next/server";
import type { Models } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getActualMemberCounts } from "@/lib/membership-count";
import { mapServerDocument } from "@/lib/server-metadata";
import { logger } from "@/lib/newrelic-utils";
import type { Server } from "@/lib/types";

type ServerDocument = Models.Document & {
	description?: string | null;
	isPublic?: boolean;
	name: string;
	ownerId: string;
};

function isPublicServerDocument(document: Models.Document): document is ServerDocument {
	const candidate = document as Record<string, unknown>;
	return (
		candidate.isPublic === true &&
		typeof candidate.name === "string" &&
		typeof candidate.ownerId === "string"
	);
}

interface PublicServersResponse {
	servers: Server[];
	nextCursor: string | null;
	total: number;
	failedIds: string[];
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/servers/public
 * Returns a paginated list of public servers for browsing/joining
 * Query params:
 *   - limit: number of servers to return (default: 20, max: 50)
 *   - cursor: cursor for pagination (server ID)
 *   - search: search term to filter by server name
 */
export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const limit = Math.min(
			Number.parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
			MAX_LIMIT,
		);
		const cursor = searchParams.get("cursor");
		const search = searchParams.get("search")?.trim();

		const env = getEnvConfig();
		const { databases } = getServerClient();

		const queries = [
			Query.equal("isPublic", true),
			Query.limit(limit + 1),
			Query.orderDesc("$createdAt"),
		];

		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		const response = await databases.listDocuments(
			env.databaseId,
			env.collections.servers,
			queries,
		);

		let serverDocuments = response.documents.filter(isPublicServerDocument);

		if (search && serverDocuments.length > 0) {
			const searchLower = search.toLowerCase();
			serverDocuments = serverDocuments.filter((doc) =>
				(doc.name || "").toLowerCase().includes(searchLower),
			);
		}

		const hasMore = serverDocuments.length > limit;
		if (hasMore) {
			serverDocuments = serverDocuments.slice(0, limit);
		}

		const memberCountsByServerId = await getActualMemberCounts(
			databases,
			serverDocuments.map((doc) => String(doc.$id)),
		);

		const servers: Server[] = [];
		const failedIds: string[] = [];
		for (const doc of serverDocuments) {
			try {
				servers.push(
					mapServerDocument(
						doc,
						memberCountsByServerId.get(String(doc.$id)) ?? 0,
					),
				);
			} catch (error) {
				failedIds.push(String(doc.$id));
				logger.error("Failed to map public server document", {
					serverId: String(doc.$id),
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const last = servers.at(-1);
		const nextCursor = hasMore && last ? last.$id : null;

		const result: PublicServersResponse = {
			servers,
			nextCursor,
			total: servers.length,
			failedIds,
		};

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to fetch servers",
			},
			{ status: 500 },
		);
	}
}
