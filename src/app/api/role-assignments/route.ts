import { NextResponse, type NextRequest } from "next/server";
import { Client, Databases, Query, ID } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";
const roleAssignmentsCollectionId = "role_assignments";
const rolesCollectionId = "roles";
const membershipsCollectionId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID || "memberships";
const profilesCollectionId = process.env.APPWRITE_PROFILES_COLLECTION_ID || "profiles";

if (!endpoint || !project || !apiKey) {
	throw new Error("Missing Appwrite configuration");
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (typeof (client as unknown as { setKey?: (k: string) => void }).setKey === "function") {
	(client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

// Helper function to update role member count
async function updateRoleMemberCount(roleId: string, serverId: string): Promise<void> {
	try {
		// Count members with this role
		const assignments = await databases.listDocuments(
			databaseId,
			roleAssignmentsCollectionId,
			[Query.equal("serverId", serverId), Query.limit(1000)]
		);

		const memberCount = assignments.documents.filter((doc) =>
			(doc.roleIds as string[]).includes(roleId)
		).length;

		// Update role document
		await databases.updateDocument(
			databaseId,
			rolesCollectionId,
			roleId,
			{ memberCount }
		);
	} catch (error) {
		console.error("Failed to update role member count:", error);
		// Don't throw - this is a non-critical update
	}
}

// GET: List role assignments
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const serverId = searchParams.get("serverId");
		const roleId = searchParams.get("roleId");
		const userId = searchParams.get("userId");

		if (!serverId) {
			return NextResponse.json({ error: "serverId is required" }, { status: 400 });
		}

		const queries = [Query.equal("serverId", serverId), Query.limit(100)];

		if (roleId) {
			// Get members with a specific role
			const assignments = await databases.listDocuments(
				databaseId,
				roleAssignmentsCollectionId,
				queries
			);

			// Filter for assignments that include this role
			const roleAssignments = assignments.documents.filter((doc) =>
				(doc.roleIds as string[]).includes(roleId)
			);

			// Enrich with user profiles
			const members = await Promise.all(
				roleAssignments.map(async (assignment) => {
					try {
						const profile = await databases.listDocuments(
							databaseId,
							profilesCollectionId,
							[Query.equal("userId", assignment.userId), Query.limit(1)]
						);

						return {
							userId: assignment.userId,
							displayName: profile.documents[0]?.displayName,
							userName: profile.documents[0]?.userId,
							avatarUrl: profile.documents[0]?.avatarUrl,
							roleIds: assignment.roleIds as string[],
						};
					} catch {
						return {
							userId: assignment.userId,
							roleIds: assignment.roleIds as string[],
						};
					}
				})
			);

			return NextResponse.json({ members });
		}

		if (userId) {
			// Get roles for a specific user
			const userAssignments = await databases.listDocuments(
				databaseId,
				roleAssignmentsCollectionId,
				[...queries, Query.equal("userId", userId)]
			);

			return NextResponse.json({
				assignments: userAssignments.documents,
			});
		}

		// Get all assignments
		const assignments = await databases.listDocuments(
			databaseId,
			roleAssignmentsCollectionId,
			queries
		);

		return NextResponse.json({ assignments: assignments.documents });
	} catch (error) {
		console.error("Failed to list role assignments:", error);
		return NextResponse.json(
			{ error: "Failed to list role assignments" },
			{ status: 500 }
		);
	}
}

// POST: Assign role to user
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { userId, serverId, roleId } = body;

		if (!userId || !serverId || !roleId) {
			return NextResponse.json(
				{ error: "userId, serverId, and roleId are required" },
				{ status: 400 }
			);
		}

		// Check if user is a member of the server
		const memberships = await databases.listDocuments(
			databaseId,
			membershipsCollectionId,
			[
				Query.equal("userId", userId),
				Query.equal("serverId", serverId),
				Query.limit(1),
			]
		);

		if (memberships.documents.length === 0) {
			return NextResponse.json(
				{ error: "User is not a member of this server" },
				{ status: 400 }
			);
		}

		// Check if assignment already exists
		const existing = await databases.listDocuments(
			databaseId,
			roleAssignmentsCollectionId,
			[
				Query.equal("userId", userId),
				Query.equal("serverId", serverId),
				Query.limit(1),
			]
		);

		if (existing.documents.length > 0) {
			// Update existing assignment
			const assignment = existing.documents[0];
			const currentRoleIds = (assignment.roleIds as string[]) || [];

			if (currentRoleIds.includes(roleId)) {
				return NextResponse.json(
					{ error: "User already has this role" },
					{ status: 400 }
				);
			}

			const updatedAssignment = await databases.updateDocument(
				databaseId,
				roleAssignmentsCollectionId,
				assignment.$id,
				{ roleIds: [...currentRoleIds, roleId] }
			);

			// Update role member count
			await updateRoleMemberCount(roleId, serverId);

			return NextResponse.json({ assignment: updatedAssignment });
		}

		// Create new assignment
		const assignment = await databases.createDocument(
			databaseId,
			roleAssignmentsCollectionId,
			ID.unique(),
			{
				userId,
				serverId,
				roleIds: [roleId],
			}
		);

		// Update role member count
		await updateRoleMemberCount(roleId, serverId);

		return NextResponse.json({ assignment }, { status: 201 });
	} catch (error) {
		console.error("Failed to assign role:", error);
		return NextResponse.json(
			{ error: "Failed to assign role" },
			{ status: 500 }
		);
	}
}

// DELETE: Remove role from user
export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("userId");
		const serverId = searchParams.get("serverId");
		const roleId = searchParams.get("roleId");

		if (!userId || !serverId || !roleId) {
			return NextResponse.json(
				{ error: "userId, serverId, and roleId are required" },
				{ status: 400 }
			);
		}

		// Find the assignment
		const assignments = await databases.listDocuments(
			databaseId,
			roleAssignmentsCollectionId,
			[
				Query.equal("userId", userId),
				Query.equal("serverId", serverId),
				Query.limit(1),
			]
		);

		if (assignments.documents.length === 0) {
			return NextResponse.json(
				{ error: "Role assignment not found" },
				{ status: 404 }
			);
		}

		const assignment = assignments.documents[0];
		const currentRoleIds = (assignment.roleIds as string[]) || [];
		const updatedRoleIds = currentRoleIds.filter((id) => id !== roleId);

		if (updatedRoleIds.length === currentRoleIds.length) {
			return NextResponse.json(
				{ error: "User does not have this role" },
				{ status: 400 }
			);
		}

		if (updatedRoleIds.length === 0) {
			// Delete the assignment if no roles left
			await databases.deleteDocument(
				databaseId,
				roleAssignmentsCollectionId,
				assignment.$id
			);
		} else {
			// Update with remaining roles
			await databases.updateDocument(
				databaseId,
				roleAssignmentsCollectionId,
				assignment.$id,
				{ roleIds: updatedRoleIds }
			);
		}

		// Update role member count
		await updateRoleMemberCount(roleId, serverId);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Failed to remove role:", error);
		return NextResponse.json(
			{ error: "Failed to remove role" },
			{ status: 500 }
		);
	}
}
