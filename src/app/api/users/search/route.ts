import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import { withAuth } from "@/lib/api-middleware";
import { logger } from "@/lib/newrelic-utils";

async function handler(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q");
		const cursor = searchParams.get("cursor");
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "25", 10), 100);

		if (!query || query.trim().length < 2) {
			return NextResponse.json(
				{ error: "Search query must be at least 2 characters" },
				{ status: 400 },
			);
		}

		const { databases } = getAdminClient();
		const env = getEnvConfig();

		// Search by displayName (case-insensitive via contains) or exact userId match
		const searchTerm = query.trim();

		const queries = [Query.limit(limit + 1)];
		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		// First try exact userId match
		let profiles = await databases.listDocuments(
			env.databaseId,
			env.collections.profiles,
			[Query.equal("userId", searchTerm), ...queries],
		);

		// If no exact userId match, search by displayName
		if (profiles.documents.length === 0) {
			profiles = await databases.listDocuments(
				env.databaseId,
				env.collections.profiles,
				[Query.search("displayName", searchTerm), ...queries],
			);
		}

		const hasMore = profiles.documents.length > limit;
		const items = hasMore ? profiles.documents.slice(0, limit) : profiles.documents;

		const users = items.map((doc) => ({
			userId: String(doc.userId),
			displayName: doc.displayName ? String(doc.displayName) : undefined,
			pronouns: doc.pronouns ? String(doc.pronouns) : undefined,
			avatarUrl: doc.avatarFileId
				? getAvatarUrl(String(doc.avatarFileId))
				: undefined,
		}));

		const nextCursor = hasMore ? items.at(-1)?.$id : undefined;

		return NextResponse.json({ users, nextCursor, hasMore });
	} catch (error) {
		logger.error("User search failed", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to search users" },
			{ status: 500 },
		);
	}
}

// Export with authentication middleware
export const GET = withAuth(handler);
