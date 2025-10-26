#!/usr/bin/env bun
/**
 * Migration script to populate memberCount for existing servers
 * This counts the memberships for each server and updates the server document
 */

import { Client, Databases, Query } from "node-appwrite";

const client = new Client()
	.setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
	.setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || "")
	.setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE || "";
const SERVERS_COLLECTION = process.env.NEXT_PUBLIC_APPWRITE_SERVERS_COLLECTION || "";
const MEMBERSHIPS_COLLECTION = process.env.NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION || "";

async function migrateServerMemberCounts() {
	console.log("[migrate] Starting member count migration...");

	try {
		// Get all servers
		const serversResponse = await databases.listDocuments(
			DATABASE_ID,
			SERVERS_COLLECTION,
			[Query.limit(500)]
		);

		console.log(`[migrate] Found ${serversResponse.documents.length} servers`);

		// For each server, count memberships and update
		for (const server of serversResponse.documents) {
			try {
				const serverId = server.$id;
				
				// Count memberships for this server
				const membershipsResponse = await databases.listDocuments(
					DATABASE_ID,
					MEMBERSHIPS_COLLECTION,
					[Query.equal("serverId", serverId), Query.limit(10000)]
				);

				const memberCount = membershipsResponse.documents.length;

				// Update server with member count
				await databases.updateDocument(
					DATABASE_ID,
					SERVERS_COLLECTION,
					serverId,
					{ memberCount }
				);

				console.log(`[migrate] Updated server ${String(server.name)} (${serverId}): ${memberCount} members`);
			} catch (error) {
				console.error(`[migrate] Failed to update server ${server.$id}:`, error);
			}
		}

		console.log("[migrate] Migration complete!");
	} catch (error) {
		console.error("[migrate] Migration failed:", error);
		process.exit(1);
	}
}

// Run the migration
void migrateServerMemberCounts();
