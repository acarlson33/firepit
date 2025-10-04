"use server";

import { ID, Query } from "node-appwrite";

import { requireAdmin, requireModerator } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { materializePermissions, perms } from "@/lib/appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const SERVERS_COLLECTION_ID = env.collections.servers;
const CHANNELS_COLLECTION_ID = env.collections.channels;
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || undefined;

export type ServerCreationResult =
	| { success: true; serverId: string; serverName: string }
	| { success: false; error: string };

export type ChannelCreationResult =
	| { success: true; channelId: string; channelName: string }
	| { success: false; error: string };

export type ServerListResult = {
	servers: Array<{
		$id: string;
		name: string;
		ownerId: string;
		createdAt: string;
	}>;
};

export type ChannelListResult = {
	channels: Array<{
		$id: string;
		name: string;
		serverId: string;
		createdAt: string;
	}>;
};

/**
 * Create a new server (Admin only)
 */
export async function createServerAction(
	name: string
): Promise<ServerCreationResult> {
	try {
		// Require admin role to create servers
		const { user } = await requireAdmin();
		const ownerId = user.$id;

		if (!name.trim()) {
			return { success: false, error: "Server name is required" };
		}

		const { databases } = getServerClient();

		// Create server with owner permissions
		const permissionStrings = perms.serverOwner(ownerId);
		const permissions = materializePermissions(permissionStrings);

		const serverDoc = await databases.createDocument(
			DATABASE_ID,
			SERVERS_COLLECTION_ID,
			ID.unique(),
			{ name: name.trim(), ownerId },
			permissions
		);

		// Create membership record if enabled
		if (MEMBERSHIPS_COLLECTION_ID) {
			try {
				const membershipPerms = materializePermissions(perms.serverOwner(ownerId));
				await databases.createDocument(
					DATABASE_ID,
					MEMBERSHIPS_COLLECTION_ID,
					ID.unique(),
					{
						serverId: serverDoc.$id,
						userId: ownerId,
						role: "owner",
					},
					membershipPerms
				);
			} catch {
				// Non-critical: membership creation failed but server exists
			}
		}

		return {
			success: true,
			serverId: serverDoc.$id,
			serverName: name.trim(),
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to create server",
		};
	}
}

/**
 * Create a new channel (Admin or Moderator)
 */
export async function createChannelAction(
	serverId: string,
	name: string
): Promise<ChannelCreationResult> {
	try {
		// Require moderator role (admins are also moderators)
		await requireModerator();

		if (!name.trim()) {
			return { success: false, error: "Channel name is required" };
		}

		if (!serverId) {
			return { success: false, error: "Server ID is required" };
		}

		const { databases } = getServerClient();

		// Create channel with public read permissions
		const permissionStrings = ['read("any")'];
		const permissions = materializePermissions(permissionStrings);

		const channelDoc = await databases.createDocument(
			DATABASE_ID,
			CHANNELS_COLLECTION_ID,
			ID.unique(),
			{ name: name.trim(), serverId },
			permissions
		);

		return {
			success: true,
			channelId: channelDoc.$id,
			channelName: name.trim(),
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to create channel",
		};
	}
}

/**
 * List all servers (Admin only)
 */
export async function listServersAction(): Promise<ServerListResult> {
	try {
		await requireAdmin();

		const { databases } = getServerClient();
		const response = await databases.listDocuments(
			DATABASE_ID,
			SERVERS_COLLECTION_ID,
			[Query.limit(100), Query.orderDesc("$createdAt")]
		);

		const servers = response.documents.map((doc) => ({
			$id: doc.$id,
			name: String(doc.name),
			ownerId: String(doc.ownerId),
			createdAt: String(doc.createdAt || doc.$createdAt),
		}));

		return { servers };
	} catch {
		return { servers: [] };
	}
}

/**
 * List channels for a server (Admin or Moderator)
 */
export async function listChannelsAction(
	serverId: string
): Promise<ChannelListResult> {
	try {
		await requireModerator();

		if (!serverId) {
			return { channels: [] };
		}

		const { databases } = getServerClient();
		const response = await databases.listDocuments(
			DATABASE_ID,
			CHANNELS_COLLECTION_ID,
			[Query.equal("serverId", serverId), Query.limit(100)]
		);

		const channels = response.documents.map((doc) => ({
			$id: doc.$id,
			name: String(doc.name),
			serverId: String(doc.serverId),
			createdAt: String(doc.createdAt || doc.$createdAt),
		}));

		return { channels };
	} catch {
		return { channels: [] };
	}
}
