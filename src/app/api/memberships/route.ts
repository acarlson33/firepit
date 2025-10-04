import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Membership } from "@/lib/types";

/**
 * GET /api/memberships
 * Fetches all memberships for the authenticated user
 */
export async function GET() {
	try {
		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const env = getEnvConfig();
		const membershipCollectionId = env.collections.memberships;

		if (!membershipCollectionId) {
			return NextResponse.json({ memberships: [] });
		}

		const { databases } = getServerClient();
		const userId = user.$id;

		// Fetch all memberships for this user
		const res = await databases.listDocuments(
			env.databaseId,
			membershipCollectionId,
			[Query.equal("userId", userId), Query.limit(500)]
		);

		const memberships: Membership[] = res.documents.map((doc) => {
			const d = doc as unknown as Record<string, unknown>;
			return {
				$id: String(d.$id),
				serverId: String(d.serverId),
				userId: String(d.userId),
				role: d.role as "owner" | "member",
				$createdAt: String(d.$createdAt ?? ""),
			} satisfies Membership;
		});

		return NextResponse.json({ memberships });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch memberships",
			},
			{ status: 500 }
		);
	}
}
