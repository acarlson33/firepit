import { NextResponse, type NextRequest } from "next/server";
import { Query, ID } from "node-appwrite";
import type { Permission } from "@/lib/types";
import { getAdminClient } from "@/lib/appwrite-admin";
import { logger } from "@/lib/posthog-utils";
import { getEnvConfig } from "@/lib/appwrite-core";

const env = getEnvConfig();
const overridesCollectionId = "channel_permission_overrides";

// GET: List permission overrides for a channel with pagination
export async function GET(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const { searchParams } = new URL(request.url);
		const channelId = searchParams.get("channelId");
		const cursor = searchParams.get("cursor");
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "50", 10), 100);

		if (!channelId) {
			return NextResponse.json(
				{ error: "channelId is required" },
				{ status: 400 }
			);
		}

		const queries = [
			Query.equal("channelId", channelId),
			Query.limit(limit + 1),
		];

		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		const overrides = await databases.listDocuments(
			env.databaseId,
			overridesCollectionId,
			queries
		);

		const hasMore = overrides.documents.length > limit;
		const items = hasMore ? overrides.documents.slice(0, limit) : overrides.documents;
		const nextCursor = hasMore ? items.at(-1)?.$id : undefined;

		return NextResponse.json({ overrides: items, nextCursor, hasMore });
	} catch (error) {
		logger.error("Failed to list channel permissions", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to list channel permissions" },
			{ status: 500 }
		);
	}
}

// POST: Create permission override
export async function POST(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const body = await request.json();
		const { channelId, roleId, userId, allow, deny } = body;

		if (!channelId) {
			return NextResponse.json(
				{ error: "channelId is required" },
				{ status: 400 }
			);
		}

		if (!roleId && !userId) {
			return NextResponse.json(
				{ error: "Either roleId or userId must be provided" },
				{ status: 400 }
			);
		}

		if (roleId && userId) {
			return NextResponse.json(
				{ error: "Cannot specify both roleId and userId" },
				{ status: 400 }
			);
		}

		// Validate permissions
		const validPermissions: Permission[] = [
			"readMessages",
			"sendMessages",
			"manageMessages",
			"manageChannels",
			"manageRoles",
			"manageServer",
			"mentionEveryone",
			"administrator",
		];

		const allowArray = (allow || []) as string[];
		const denyArray = (deny || []) as string[];

		const invalidAllow = allowArray.filter(
			(p) => !validPermissions.includes(p as Permission)
		);
		const invalidDeny = denyArray.filter(
			(p) => !validPermissions.includes(p as Permission)
		);

		if (invalidAllow.length > 0 || invalidDeny.length > 0) {
			return NextResponse.json(
				{ error: "Invalid permission values" },
				{ status: 400 }
			);
		}

		// Check if override already exists
		const queries = [
			Query.equal("channelId", channelId),
			Query.limit(1),
		];

		if (roleId) {
			queries.push(Query.equal("roleId", roleId));
		}
		if (userId) {
			queries.push(Query.equal("userId", userId));
		}

		const existing = await databases.listDocuments(
			env.databaseId,
			overridesCollectionId,
			queries
		);

		if (existing.documents.length > 0) {
			return NextResponse.json(
				{ error: "Override already exists for this role/user in this channel" },
				{ status: 400 }
			);
		}

		// Create override
		const overrideData: Record<string, unknown> = {
			channelId,
			allow: allowArray,
			deny: denyArray,
		};

		if (roleId) {
			overrideData.roleId = roleId;
			overrideData.userId = ""; // Ensure userId is empty string for role overrides
		} else if (userId) {
			overrideData.userId = userId;
			overrideData.roleId = ""; // Ensure roleId is empty string for user overrides
		}

		const override = await databases.createDocument(
			env.databaseId,
			overridesCollectionId,
			ID.unique(),
			overrideData
		);

		return NextResponse.json({ override }, { status: 201 });
	} catch (error) {
		logger.error("Failed to create channel permission", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to create channel permission" },
			{ status: 500 }
		);
	}
}

// PUT: Update permission override
export async function PUT(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const body = await request.json();
		const { overrideId, allow, deny } = body;

		if (!overrideId) {
			return NextResponse.json(
				{ error: "overrideId is required" },
				{ status: 400 }
			);
		}

		// Validate permissions
		const validPermissions: Permission[] = [
			"readMessages",
			"sendMessages",
			"manageMessages",
			"manageChannels",
			"manageRoles",
			"manageServer",
			"mentionEveryone",
			"administrator",
		];

		const allowArray = (allow || []) as string[];
		const denyArray = (deny || []) as string[];

		const invalidAllow = allowArray.filter(
			(p) => !validPermissions.includes(p as Permission)
		);
		const invalidDeny = denyArray.filter(
			(p) => !validPermissions.includes(p as Permission)
		);

		if (invalidAllow.length > 0 || invalidDeny.length > 0) {
			return NextResponse.json(
				{ error: "Invalid permission values" },
				{ status: 400 }
			);
		}

		const override = await databases.updateDocument(
			env.databaseId,
			overridesCollectionId,
			overrideId,
			{
				allow: allowArray,
				deny: denyArray,
			}
		);

		return NextResponse.json({ override });
	} catch (error) {
		logger.error("Failed to update channel permission", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to update channel permission" },
			{ status: 500 }
		);
	}
}

// DELETE: Remove permission override
export async function DELETE(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const { searchParams } = new URL(request.url);
		const overrideId = searchParams.get("overrideId");

		if (!overrideId) {
			return NextResponse.json(
				{ error: "overrideId is required" },
				{ status: 400 }
			);
		}

		await databases.deleteDocument(env.databaseId, overridesCollectionId, overrideId);

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error("Failed to delete channel permission", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to delete channel permission" },
			{ status: 500 }
		);
	}
}
