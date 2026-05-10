import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { logger } from "@/lib/newrelic-utils";

// Define explicit interfaces for Appwrite documents used in this route
interface RoleDocument {
	$id: string;
	serverId: string;
	name: string;
	color?: string | null;
	mentionable?: boolean;
}

interface RoleAssignmentDocument {
	$id: string;
	serverId: string;
	roleId: string;
	userId: string;
}

// Minimal shape for the Appwrite databases client methods used here.
interface DatabasesType {
	listDocuments(
		databaseId: string,
		collectionId: string,
		queries?: string[],
	): Promise<{ documents: Array<unknown> }>;
	listDocuments(params: {
		databaseId: string;
		collectionId: string;
		queries?: string[];
		transactionId?: string;
		total?: boolean;
		ttl?: number;
	}): Promise<{ documents: Array<unknown> }>;
}

// Minimal shape for the environment config used by this module.
interface EnvType {
	databaseId: string;
	collections: {
		roles: string;
		roleAssignments: string;
		[key: string]: string;
	};
}

async function getAllDocumentsPaginated<T>(
	databases: DatabasesType,
	env: EnvType,
	collectionId: string,
	serverId: string,
	limit = 100,
): Promise<Array<T>> {
	const results: Array<T> = [];
	let offset = 0;
	let hasMore = true;

	// This loop intentionally awaits each page sequentially to avoid
	// overwhelming the Appwrite server with parallel requests and to
	// respect the service's pagination model.
	// eslint-disable-next-line no-await-in-loop
	while (hasMore) {
		const resp = await databases.listDocuments(
			env.databaseId,
			collectionId,
			[
				Query.equal("serverId", serverId),
				Query.limit(limit),
				Query.offset(offset),
			],
		);

		results.push(...(resp.documents as Array<T>));
		hasMore = resp.documents.length === limit;
		offset += limit;
	}

	return results;
}


/**
 * GET /api/servers/[serverId]/mentionable-roles
 *
 * Returns all roles in a server that are marked as mentionable.
 * Accessible to all members of the server.
 *
 * Response:
 * {
 *   "roles": [
 *     { "id": "role-id", "name": "Role Name", "color": "#FF0000", "mentionable": true, "memberCount": 5 }
 *   ]
 * }
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ serverId: string }> },
) {
	const { serverId } = await params;
	try {
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 },
			);
		}

		const env = getEnvConfig();

		const { databases } = getServerClient();

		// Check if user is a member of the server
		const serverAccess = await getServerPermissionsForUser(
			databases,
			env,
			serverId,
			user.$id,
		);

		if (!serverAccess.isMember) {
			return NextResponse.json({ error: "Not a server member" }, { status: 403 });
		}

		// Fetch all roles and assignments using a helper that handles pagination.
		const allRoles = await getAllDocumentsPaginated<RoleDocument>(
			databases,
			env,
			env.collections.roles,
			serverId,
		);

		const allAssignments = await getAllDocumentsPaginated<RoleAssignmentDocument>(
			databases,
			env,
			env.collections.roleAssignments,
			serverId,
		);

		// Build a map of roleId -> member count for efficient lookup
		const memberCountByRoleId = new Map<string, number>();
		for (const assignment of allAssignments) {
			const roleId = assignment.roleId;
			memberCountByRoleId.set(
				roleId,
				(memberCountByRoleId.get(roleId) ?? 0) + 1,
			);
		}

		// Filter to mentionable roles and build response
		const mentionableRoles = allRoles
			.filter((doc) => doc.mentionable === true)
			.map((doc) => ({
				id: doc.$id,
				name: doc.name,
				color: doc.color,
				mentionable: Boolean(doc.mentionable),
				memberCount: memberCountByRoleId.get(String(doc.$id)) ?? 0,
			}));

		return NextResponse.json({ roles: mentionableRoles });
	} catch (error) {
		logger.error("Failed to fetch mentionable roles", { error, serverId });
		return NextResponse.json(
			{ error: "Failed to fetch roles" },
			{ status: 500 },
		);
	}
}
