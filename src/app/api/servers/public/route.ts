import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
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
			[
				Query.equal("isPublic", true),
				Query.limit(100),
				Query.orderDesc("$createdAt"),
			]
		);

		const publicServerDocuments = response.documents.filter(
			isPublicServerDocument,
		);

		const memberCountsByServerId = await getActualMemberCounts(
			databases,
			publicServerDocuments.map((doc) => String(doc.$id)),
		);

		// Enrich servers with actual member counts from memberships
		const servers = [] as Server[];
		const failedIds: string[] = [];
		for (const doc of publicServerDocuments) {
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

		return NextResponse.json({ servers, failedIds });
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
