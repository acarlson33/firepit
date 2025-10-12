import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q");

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

		// First try exact userId match
		let profiles = await databases.listDocuments(
			env.databaseId,
			env.collections.profiles,
			[Query.equal("userId", searchTerm), Query.limit(25)],
		);

		// If no exact userId match, search by displayName
		if (profiles.documents.length === 0) {
			profiles = await databases.listDocuments(
				env.databaseId,
				env.collections.profiles,
				[Query.search("displayName", searchTerm), Query.limit(25)],
			);
		}

		const users = profiles.documents.map((doc) => ({
			userId: String(doc.userId),
			displayName: doc.displayName ? String(doc.displayName) : undefined,
			pronouns: doc.pronouns ? String(doc.pronouns) : undefined,
			avatarUrl: doc.avatarFileId
				? getAvatarUrl(String(doc.avatarFileId))
				: undefined,
		}));

		return NextResponse.json({ users });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to search users" },
			{ status: 500 },
		);
	}
}
