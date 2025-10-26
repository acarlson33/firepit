import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * GET /api/servers/public
 * Returns a list of all public servers for browsing/joining
 */
export async function GET() {
	try {
		const env = getEnvConfig();
		const { databases } = getServerClient();

		const response = await databases.listDocuments(
			env.databaseId,
			env.collections.servers,
			[Query.limit(100), Query.orderDesc("$createdAt")]
		);

		const servers = response.documents.map((doc) => ({
			$id: doc.$id,
			name: String(doc.name),
			ownerId: String(doc.ownerId),
			memberCount: typeof doc.memberCount === 'number' ? doc.memberCount : undefined,
		}));

		return NextResponse.json({ servers });
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
