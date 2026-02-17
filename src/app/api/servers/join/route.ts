import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import {
	logger,
	recordError,
	setTransactionName,
	trackApiCall,
	addTransactionAttributes,
	recordEvent,
} from "@/lib/newrelic-utils";
import { assignDefaultRoleServer } from "@/lib/default-role";

/**
 * POST /api/servers/join
 * Joins a user to a server by creating a membership record and increments the server's member count
 * Uses SSR authentication to verify the user
 */
export async function POST(request: NextRequest) {
	const startTime = Date.now();
	
	try {
		setTransactionName("POST /api/servers/join");
		
		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			logger.warn("Unauthenticated join attempt");
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
		
		addTransactionAttributes({
			userId,
			serverId,
		});

		const { databases } = getServerClient();

		// Check if server exists
		let serverDoc;
		try {
			serverDoc = await databases.getDocument(
				env.databaseId,
				env.collections.servers,
				serverId
			);
		} catch {
			logger.warn("Server not found", { serverId });
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
			logger.warn("User already a member", { userId, serverId });
			return NextResponse.json(
				{ error: "You are already a member of this server" },
				{ status: 400 }
			);
		}

		// Create membership
		const membershipPerms = perms.serverOwner(userId);
		const dbStartTime = Date.now();
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
		
		// Increment server member count
		const currentCount = typeof serverDoc.memberCount === 'number' ? serverDoc.memberCount : 0;
		try {
			await databases.updateDocument(
				env.databaseId,
				env.collections.servers,
				serverId,
				{ memberCount: currentCount + 1 }
			);
			try {
				await assignDefaultRoleServer(serverId, userId);
			} catch {
				// Non-fatal: continue even if default role assignment fails
			}
		} catch (error) {
			// Log but don't fail if we can't update the count
			logger.warn("Failed to update member count", { 
				serverId, 
				error: error instanceof Error ? error.message : String(error) 
			});
		}
		
		trackApiCall(
			"/api/servers/join",
			"POST",
			200,
			Date.now() - dbStartTime,
			{ operation: "joinServer", serverId }
		);
		
		recordEvent("ServerJoin", {
			userId,
			serverId,
			newMemberCount: currentCount + 1,
		});
		
		logger.info("User joined server", {
			userId,
			serverId,
			duration: Date.now() - startTime,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		recordError(
			error instanceof Error ? error : new Error(String(error)),
			{
				context: "POST /api/servers/join",
				endpoint: "/api/servers/join",
			}
		);
		
		logger.error("Failed to join server", {
			error: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		});
		
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to join server",
			},
			{ status: 500 }
		);
	}
}
