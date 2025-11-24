import { NextResponse, type NextRequest } from "next/server";
import { Query, ID } from "node-appwrite";
import { z } from "zod";
import type { Role } from "@/lib/types";
import { roleSchema, validateBody } from "@/lib/validation";
import { logger } from "@/lib/posthog-utils";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";

const env = getEnvConfig();
const rolesCollectionId = "roles";

// GET: List roles for a server with pagination
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const serverId = searchParams.get("serverId");
		const cursor = searchParams.get("cursor");
		const limit = Math.min(Number.parseInt(searchParams.get("limit") || "50", 10), 100);

		if (!serverId) {
			return NextResponse.json({ error: "serverId is required" }, { status: 400 });
		}

		const { databases } = getAdminClient();

		const queries = [
			Query.equal("serverId", serverId),
			Query.orderDesc("position"),
			Query.limit(limit + 1),
		];

		if (cursor) {
			queries.push(Query.cursorAfter(cursor));
		}

		const response = await databases.listDocuments(env.databaseId, rolesCollectionId, queries);

		const hasMore = response.documents.length > limit;
		const items = hasMore ? response.documents.slice(0, limit) : response.documents;
		const nextCursor = hasMore ? items.at(-1)?.$id : undefined;

		return NextResponse.json({ roles: items, nextCursor, hasMore });
	} catch (error) {
		logger.error("Failed to list roles", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to list roles" },
			{ status: 500 }
		);
	}
}

// POST: Create a new role
export async function POST(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const body = await request.json();
		
		// Check required fields first with clear error messages
		if (!body.serverId) {
			return NextResponse.json(
				{ error: "serverId is required" },
				{ status: 400 }
			);
		}
		
		if (!body.name) {
			return NextResponse.json(
				{ error: "name is required" },
				{ status: 400 }
			);
		}
		
		// Validate role data
		const validation = validateBody(roleSchema.extend({ serverId: z.string().min(1) }), {
			serverId: body.serverId,
			name: body.name,
			color: body.color,
			position: body.position,
			permissions: body.permissions,
		});
		
		if (!validation.success) {
			return NextResponse.json(
				{ error: validation.error, issues: validation.issues },
				{ status: 400 }
			);
		}
		
		const {
			serverId,
			name,
			color,
			position,
			readMessages,
			sendMessages,
			manageMessages,
			manageChannels,
			manageRoles,
			manageServer,
			mentionEveryone,
			administrator,
			mentionable,
		} = body;

		const roleData = {
			serverId,
			name,
			color: color || "#5865F2",
			position: position ?? 0,
			readMessages: readMessages ?? true,
			sendMessages: sendMessages ?? true,
			manageMessages: manageMessages ?? false,
			manageChannels: manageChannels ?? false,
			manageRoles: manageRoles ?? false,
			manageServer: manageServer ?? false,
			mentionEveryone: mentionEveryone ?? false,
			administrator: administrator ?? false,
			mentionable: mentionable ?? true,
			memberCount: 0,
		};

		const role = await databases.createDocument(
			env.databaseId,
			rolesCollectionId,
			ID.unique(),
			roleData
		);

		return NextResponse.json({ role }, { status: 201 });
	} catch (error) {
		logger.error("Failed to create role", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to create role" },
			{ status: 500 }
		);
	}
}

// PATCH: Update an existing role
export async function PATCH(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const body = await request.json();
		const {
			$id,
			name,
			color,
			position,
			readMessages,
			sendMessages,
			manageMessages,
			manageChannels,
			manageRoles,
			manageServer,
			mentionEveryone,
			administrator,
			mentionable,
		} = body;

		if (!$id) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		const updateData: Partial<Role> = {};
		if (name !== undefined) {
			updateData.name = name;
		}
		if (color !== undefined) {
			updateData.color = color;
		}
		if (position !== undefined) {
			updateData.position = position;
		}
		if (readMessages !== undefined) {
			updateData.readMessages = readMessages;
		}
		if (sendMessages !== undefined) {
			updateData.sendMessages = sendMessages;
		}
		if (manageMessages !== undefined) {
			updateData.manageMessages = manageMessages;
		}
		if (manageChannels !== undefined) {
			updateData.manageChannels = manageChannels;
		}
		if (manageRoles !== undefined) {
			updateData.manageRoles = manageRoles;
		}
		if (manageServer !== undefined) {
			updateData.manageServer = manageServer;
		}
		if (mentionEveryone !== undefined) {
			updateData.mentionEveryone = mentionEveryone;
		}
		if (administrator !== undefined) {
			updateData.administrator = administrator;
		}
		if (mentionable !== undefined) {
			updateData.mentionable = mentionable;
		}

		const role = await databases.updateDocument(
			env.databaseId,
			rolesCollectionId,
			$id,
			updateData
		);

		return NextResponse.json({ role });
	} catch (error) {
		logger.error("Failed to update role", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to update role" },
			{ status: 500 }
		);
	}
}

// DELETE: Remove a role
export async function DELETE(request: NextRequest) {
	try {
		const { databases } = getAdminClient();
		const { searchParams } = new URL(request.url);
		const roleId = searchParams.get("roleId");

		if (!roleId) {
			return NextResponse.json({ error: "roleId is required" }, { status: 400 });
		}

		await databases.deleteDocument(env.databaseId, rolesCollectionId, roleId);

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error("Failed to delete role", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return NextResponse.json(
			{ error: "Failed to delete role" },
			{ status: 500 }
		);
	}
}
