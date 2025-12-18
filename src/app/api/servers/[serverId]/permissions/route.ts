import { NextResponse, type NextRequest } from "next/server";
import { Client, Databases, Query } from "node-appwrite";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Role, ChannelPermissionOverride } from "@/lib/types";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";
const rolesCollectionId = "roles";
const roleAssignmentsCollectionId = "role_assignments";
const channelPermissionOverridesCollectionId = "channel_permission_overrides";

if (!endpoint || !project || !apiKey) {
	throw new Error("Missing Appwrite configuration");
}

// Initialize Appwrite client
const client = new Client().setEndpoint(endpoint).setProject(project);
if (
	typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
	"function"
) {
	(client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

// GET: Get user's effective permissions for a server/channel
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ serverId: string }> }
) {
	try {
		const { serverId } = await params;
		const { searchParams } = new URL(request.url);
		const channelId = searchParams.get("channelId");
		const userId = searchParams.get("userId");

		if (!serverId) {
			return NextResponse.json(
				{ error: "serverId is required" },
				{ status: 400 }
			);
		}

		if (!userId) {
			return NextResponse.json(
				{ error: "userId is required" },
				{ status: 400 }
			);
		}

		// Get user's role assignments for this server
		const assignmentsResponse = await databases.listDocuments(
			databaseId,
			roleAssignmentsCollectionId,
			[
				Query.equal("serverId", serverId),
				Query.equal("userId", userId),
				Query.limit(100),
			]
		);

		const roleIds = assignmentsResponse.documents.map(
			(a) => a.roleId as string
		);

		// Get the role definitions
		let roles: Role[] = [];
		if (roleIds.length > 0) {
			const rolesResponse = await databases.listDocuments(
				databaseId,
				rolesCollectionId,
				[Query.equal("$id", roleIds), Query.limit(100)]
			);
			roles = rolesResponse.documents as unknown as Role[];
		}

		// Get channel permission overrides if channelId is provided
		let channelOverrides: ChannelPermissionOverride[] = [];
		if (channelId && roleIds.length > 0) {
			const overridesResponse = await databases.listDocuments(
				databaseId,
				channelPermissionOverridesCollectionId,
				[
					Query.equal("channelId", channelId),
					Query.equal("roleId", roleIds),
					Query.limit(100),
				]
			);
			channelOverrides =
				overridesResponse.documents as unknown as ChannelPermissionOverride[];
		}

		// Calculate effective permissions
		const effectivePerms = getEffectivePermissions(roles, channelOverrides);

		// Return all permissions directly from effectivePerms
		return NextResponse.json(effectivePerms);
	} catch (error) {
		console.error("Failed to get permissions:", error);
		return NextResponse.json(
			{ error: "Failed to get permissions" },
			{ status: 500 }
		);
	}
}
