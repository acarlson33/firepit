import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { logger } from "@/lib/posthog-utils";
import { getEnvConfig } from "@/lib/appwrite-core";

const env = getEnvConfig();
const roleAssignmentsCollectionId = "role_assignments";
const membershipsCollectionId = env.collections.memberships;
const profilesCollectionId = env.collections.profiles;

type RouteContext = {
	params: Promise<{ serverId: string }>;
};

export async function GET(
	request: Request,
	context: RouteContext
) {
	try {
		const { databases } = getAdminClient();
		const { serverId } = await context.params;

		if (!membershipsCollectionId) {
			return NextResponse.json(
				{ error: "Memberships collection not configured" },
				{ status: 500 }
			);
		}

		// Get all memberships for this server
		const memberships = await databases.listDocuments(
			env.databaseId,
			membershipsCollectionId,
			[Query.equal("serverId", serverId), Query.limit(100)]
		);

		// Get role assignments for this server
		const roleAssignments = await databases.listDocuments(
			env.databaseId,
			roleAssignmentsCollectionId,
			[Query.equal("serverId", serverId), Query.limit(100)]
		);

		// Create a map of userId to roleIds
		const roleMap = new Map<string, string[]>();
		for (const assignment of roleAssignments.documents) {
			roleMap.set(assignment.userId as string, (assignment.roleIds as string[]) || []);
		}

		// Batch fetch all user profiles
		const userIds = memberships.documents.map((m) => m.userId as string);
		const profileQueries = userIds.length > 0
			? [Query.equal("userId", userIds), Query.limit(userIds.length)]
			: [];

		const profilesResponse = userIds.length > 0
			? await databases.listDocuments(env.databaseId, profilesCollectionId, profileQueries)
			: { documents: [] };

		// Create profile map for O(1) lookup
		const profileMap = new Map();
		for (const profile of profilesResponse.documents) {
			profileMap.set(profile.userId, profile);
		}

		// Enrich memberships with profile data and roles
		const members = memberships.documents.map((membership) => {
			const userId = membership.userId as string;
			const profile = profileMap.get(userId);

			return {
				userId,
				userName: profile?.userId,
				displayName: profile?.displayName,
				avatarUrl: profile?.avatarUrl,
				roleIds: roleMap.get(userId) || [],
			};
		});

		return NextResponse.json({ members });
	} catch (error) {
		logger.error("Failed to list server members", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to list server members" },
			{ status: 500 }
		);
	}
}
