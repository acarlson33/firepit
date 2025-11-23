/**
 * Database Performance Index Migration
 * 
 * Adds performance indexes to frequently queried collections.
 * These indexes improve query performance for common access patterns.
 * 
 * Usage:
 *   bun scripts/add-performance-indexes.ts check    - Check current indexes
 *   bun scripts/add-performance-indexes.ts migrate  - Apply indexes
 */

import { Client, Databases, IndexType } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";

const messagesCollection = process.env.APPWRITE_COLLECTION_MESSAGES || "messages";
const directMessagesCollection = process.env.APPWRITE_COLLECTION_DIRECT_MESSAGES || "direct_messages";
const membershipsCollection = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID || "memberships";
const serversCollection = process.env.APPWRITE_COLLECTION_SERVERS || "servers";
const invitesCollection = process.env.APPWRITE_INVITES_COLLECTION_ID || "invites";

if (!endpoint || !project || !apiKey) {
	console.error("❌ Missing Appwrite configuration");
	process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (typeof (client as unknown as { setKey?: (k: string) => void }).setKey === "function") {
	(client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

interface IndexDefinition {
	collectionId: string;
	collectionName: string;
	indexKey: string;
	indexType: IndexType;
	attributes: string[];
	orders?: string[];
	description: string;
}

const performanceIndexes: IndexDefinition[] = [
	// Messages: Query by channel and sort by creation time
	{
		collectionId: messagesCollection,
		collectionName: "messages",
		indexKey: "idx_messages_channel_created",
		indexType: IndexType.Key,
		attributes: ["channelId", "$createdAt"],
		orders: ["ASC", "DESC"],
		description: "Optimize message queries by channel with time-based sorting",
	},
	// Direct Messages: Query by conversation and sort by creation time
	{
		collectionId: directMessagesCollection,
		collectionName: "direct_messages",
		indexKey: "idx_dm_conversation_created",
		indexType: IndexType.Key,
		attributes: ["conversationId", "$createdAt"],
		orders: ["ASC", "DESC"],
		description: "Optimize DM queries by conversation with time-based sorting",
	},
	// Memberships: Query by user to find all servers
	{
		collectionId: membershipsCollection,
		collectionName: "memberships",
		indexKey: "idx_membership_user",
		indexType: IndexType.Key,
		attributes: ["userId"],
		description: "Optimize queries for user's server memberships",
	},
	// Memberships: Query by server to find all members (already exists from Phase 2)
	{
		collectionId: membershipsCollection,
		collectionName: "memberships",
		indexKey: "idx_membership_server",
		indexType: IndexType.Key,
		attributes: ["serverId"],
		description: "Optimize queries for server's member list",
	},
	// Servers: Query by owner
	{
		collectionId: serversCollection,
		collectionName: "servers",
		indexKey: "idx_servers_owner",
		indexType: IndexType.Key,
		attributes: ["ownerId"],
		description: "Optimize queries for user's owned servers",
	},
	// Invites: Query by server (already exists from Phase 2)
	{
		collectionId: invitesCollection,
		collectionName: "invites",
		indexKey: "idx_invites_server",
		indexType: IndexType.Key,
		attributes: ["serverId"],
		description: "Optimize queries for server's invites",
	},
	// Invites: Query by server and expiration (already exists from Phase 2 as idx_server_active)
	{
		collectionId: invitesCollection,
		collectionName: "invites",
		indexKey: "idx_invites_server_expires",
		indexType: IndexType.Key,
		attributes: ["serverId", "expiresAt"],
		orders: ["ASC", "DESC"],
		description: "Optimize queries for active invites with expiration filtering",
	},
];

async function checkIndexes(): Promise<void> {
	console.log("🔍 Checking existing indexes...\n");

	const indexStatus = new Map<string, { exists: boolean; index?: IndexDefinition }>();

	for (const indexDef of performanceIndexes) {
		try {
			const collection = await databases.getCollection(databaseId, indexDef.collectionId);
			const existingIndexes = collection.indexes || [];
			
			const exists = existingIndexes.some(
				(idx: { key: string }) => idx.key === indexDef.indexKey
			);

			indexStatus.set(indexDef.indexKey, { exists, index: indexDef });

			if (exists) {
				console.log(`✅ ${indexDef.collectionName}.${indexDef.indexKey} - EXISTS`);
			} else {
				console.log(`❌ ${indexDef.collectionName}.${indexDef.indexKey} - MISSING`);
			}
		} catch (error) {
			console.error(`⚠️  Collection ${indexDef.collectionName} not found:`, error);
			indexStatus.set(indexDef.indexKey, { exists: false, index: indexDef });
		}
	}

	const missing = Array.from(indexStatus.values()).filter((s) => !s.exists);
	const existing = Array.from(indexStatus.values()).filter((s) => s.exists);

	console.log(`\n📊 Summary: ${existing.length} existing, ${missing.length} missing`);

	if (missing.length > 0) {
		console.log("\n💡 Run 'bun scripts/add-performance-indexes.ts migrate' to create missing indexes");
	}
}

async function migrateIndexes(): Promise<void> {
	console.log("🚀 Starting index migration...\n");

	let created = 0;
	let skipped = 0;
	let failed = 0;

	for (const indexDef of performanceIndexes) {
		try {
			const collection = await databases.getCollection(databaseId, indexDef.collectionId);
			const existingIndexes = collection.indexes || [];
			
			const exists = existingIndexes.some(
				(idx: { key: string }) => idx.key === indexDef.indexKey
			);

			if (exists) {
				console.log(`⏭️  Skipping ${indexDef.collectionName}.${indexDef.indexKey} (already exists)`);
				skipped++;
				continue;
			}

			console.log(`📝 Creating ${indexDef.collectionName}.${indexDef.indexKey}...`);
			console.log(`   ${indexDef.description}`);

			await databases.createIndex(
				databaseId,
				indexDef.collectionId,
				indexDef.indexKey,
				indexDef.indexType,
				indexDef.attributes,
				indexDef.orders
			);

			console.log(`✅ Created ${indexDef.indexKey}\n`);
			created++;
		} catch (error) {
			console.error(`❌ Failed to create ${indexDef.indexKey}:`, error);
			failed++;
		}
	}

	console.log("\n" + "=".repeat(60));
	console.log("📊 Migration Summary:");
	console.log(`   ✅ Created: ${created}`);
	console.log(`   ⏭️  Skipped: ${skipped}`);
	console.log(`   ❌ Failed: ${failed}`);
	console.log("=".repeat(60));

	if (created > 0) {
		console.log("\n🎉 Performance indexes applied successfully!");
		console.log("💡 Query performance should be improved for:");
		console.log("   - Message loading by channel");
		console.log("   - Direct message loading by conversation");
		console.log("   - Member list queries");
		console.log("   - User's servers list");
		console.log("   - Server owner queries");
		console.log("   - Invite queries");
	}
}

// Main execution
const command = process.argv[2];

if (command === "check") {
	checkIndexes().catch((error) => {
		console.error("❌ Check failed:", error);
		process.exit(1);
	});
} else if (command === "migrate") {
	migrateIndexes().catch((error) => {
		console.error("❌ Migration failed:", error);
		process.exit(1);
	});
} else {
	console.log("Usage:");
	console.log("  bun scripts/add-performance-indexes.ts check    - Check current indexes");
	console.log("  bun scripts/add-performance-indexes.ts migrate  - Apply indexes");
	process.exit(1);
}
