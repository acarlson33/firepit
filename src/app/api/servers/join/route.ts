import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";

/**
 * POST /api/servers/join
 * Joins a user to a server by creating a membership record
 * Uses SSR authentication to verify the user
 */
export async function POST(request: NextRequest) {
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
			return NextResponse.json(
				{ error: "Memberships are not enabled on this instance" },
				{ status: 400 }
			);
		}

		const body = await request.json();
		const { serverId } = body;

		if (!serverId) {
			return NextResponse.json(
				{ error: "serverId is required" },
				{ status: 400 }
			);
		}

		// Use authenticated user's ID, not from request body (security)
		const userId = user.$id;

		const { databases } = getServerClient();

		// Check if server exists
		try {
			await databases.getDocument(
				env.databaseId,
				env.collections.servers,
				serverId
			);
		} catch {
			return NextResponse.json(
				{ error: "Server not found" },
				{ status: 404 }
			);
		}

		// Check if user is already a member
		const existingMembership = await databases.listDocuments(
			env.databaseId,
			membershipCollectionId,
			[
				Query.equal("userId", userId),
				Query.equal("serverId", serverId),
				Query.limit(1),
			]
		);

		if (existingMembership.documents.length > 0) {
			return NextResponse.json(
				{ error: "You are already a member of this server" },
				{ status: 400 }
			);
		}

		// Create membership
		const membershipPerms = perms.serverOwner(userId);
		await databases.createDocument(
			env.databaseId,
			membershipCollectionId,
			ID.unique(),
			{
				serverId,
				userId,
				role: "member",
			},
			membershipPerms
		);

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to join server",
			},
			{ status: 500 }
		);
	}
}
