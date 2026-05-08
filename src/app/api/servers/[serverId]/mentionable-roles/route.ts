import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { logger } from "@/lib/newrelic-utils";


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

		if (!serverId) {
			return NextResponse.json(
				{ error: "Server ID required" },
				{ status: 400 },
			);
		}

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

		// Fetch all roles in the server with pagination support
		let allRoles: Array<Record<string, unknown>> = [];
		let offset = 0;
		const limit = 100;
		let hasMore = true;

		while (hasMore) {
			const rolesResponse = await databases.listDocuments(
				env.databaseId,
				env.collections.roles,
				[
					Query.equal("serverId", serverId),
					Query.limit(limit),
					Query.offset(offset),
				],
			);

			allRoles.push(...rolesResponse.documents);
			hasMore = rolesResponse.documents.length === limit;
			offset += limit;
		}

		// Fetch all role assignments for this server once (avoid N+1 queries)
		let allAssignments: Array<Record<string, unknown>> = [];
		offset = 0;
		hasMore = true;

		while (hasMore) {
			const assignmentsResponse = await databases.listDocuments(
				env.databaseId,
				env.collections.roleAssignments,
				[
					Query.equal("serverId", serverId),
					Query.limit(limit),
					Query.offset(offset),
				],
			);

			allAssignments.push(...assignmentsResponse.documents);
			hasMore = assignmentsResponse.documents.length === limit;
			offset += limit;
		}

		// Build a map of roleId -> member count for efficient lookup
		const memberCountByRoleId = new Map<string, number>();
		for (const assignment of allAssignments) {
			const roleId = assignment.roleId as string;
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
				mentionable: doc.mentionable,
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
