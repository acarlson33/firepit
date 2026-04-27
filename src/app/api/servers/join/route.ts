import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { AppwriteException } from "node-appwrite";

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
import { invalidateChannelsUserCaches } from "@/lib/channels-route-cache";
import type { Membership } from "@/lib/types";

type ServerDocument = {
	$id: string;
	isPublic?: boolean;
};

function isDocumentNotFoundError(error: unknown): boolean {
	if (typeof AppwriteException === "function" && error instanceof AppwriteException) {
		return error.code === 404 || error.type === "document_not_found";
	}

	if (typeof error !== "object" || error === null) {
		return false;
	}

	const candidate = error as {
		code?: unknown;
		type?: unknown;
		response?: {
			status?: unknown;
		};
	};

	return (
		candidate.code === 404 ||
		candidate.type === "document_not_found" ||
		candidate.response?.status === 404
	);
}

/**
 * POST /api/servers/join
 * Joins a user to a server by creating a membership record
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

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ error: "Invalid JSON payload" },
				{ status: 400 }
			);
		}

		if (typeof body !== "object" || body === null || Array.isArray(body)) {
			return NextResponse.json(
				{ error: "Invalid JSON payload" },
				{ status: 400 }
			);
		}

		const serverIdValue = (body as { serverId?: unknown }).serverId;
		if (typeof serverIdValue !== "string" || serverIdValue.trim().length === 0) {
			return NextResponse.json(
				{ error: "serverId is required" },
				{ status: 400 }
			);
		}
		const serverId = serverIdValue.trim();

		// Use authenticated user's ID, not from request body (security)
		const userId = user.$id;
		
		addTransactionAttributes({
			userId,
			serverId,
		});

		const { databases } = getServerClient();

		// Check if server exists
		let serverDocument: ServerDocument;
		try {
			serverDocument = (await databases.getDocument(
				env.databaseId,
				env.collections.servers,
				serverId,
			)) as ServerDocument;
		} catch (error) {
			if (!isDocumentNotFoundError(error)) {
				throw error;
			}

			logger.warn("Server not found", { serverId });
			return NextResponse.json(
				{ error: "Server not found" },
				{ status: 404 },
			);
		}

		const isPublicServer = serverDocument.isPublic === true;

		if (!isPublicServer) {
			return NextResponse.json(
				{ error: "This server is private. Join with an invite link." },
				{ status: 403 },
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
		const membership = await databases.createDocument(
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
		
		// Assign default role to the new member
		try {
			await assignDefaultRoleServer(serverId, userId);
		} catch {
			// Non-fatal: continue even if default role assignment fails
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
		});
		
		logger.info("User joined server", {
			userId,
			serverId,
			duration: Date.now() - startTime,
		});

		const safeMembership: Membership | null = membership
			? {
				  $id: String(membership.$id),
				  $createdAt: String(membership.$createdAt ?? ""),
				  userId: String(membership.userId),
				  serverId: String(membership.serverId),
				  role: membership.role === "owner" ? "owner" : "member",
			  }
			: null;

		invalidateChannelsUserCaches({
			serverId,
			userId,
		});

		return NextResponse.json({
			success: true,
			membership: safeMembership,
		});
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
