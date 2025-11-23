/**
 * Database Unique Constraints Migration
 * 
 * This script adds unique constraints to prevent duplicate data:
 * 1. Unique invite codes (invites.code)
 * 2. Unique memberships per server (memberships: serverId+userId)
 * 
 * Note: This script uses Appwrite Admin SDK to create indexes.
 * Indexes in Appwrite serve as unique constraints when configured with unique: true
 */

import { Client, Databases, IndexType } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";

if (!endpoint || !project || !apiKey) {
	console.error("❌ Missing required environment variables:");
	console.error("   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
	process.exit(1);
}

const client = new Client()
	.setEndpoint(endpoint)
	.setProject(project)
	.setKey(apiKey);

const databases = new Databases(client);

/**
 * Index configurations for unique constraints
 */
const UNIQUE_INDEXES = [
	{
		collectionId: "invites",
		key: "unique_code",
		type: IndexType.Unique,
		attributes: ["code"],
		description: "Prevents duplicate invite codes",
	},
	{
		collectionId: "memberships",
		key: "unique_membership",
		type: IndexType.Unique,
		attributes: ["serverId", "userId"],
		description: "Prevents duplicate memberships (one per server per user)",
	},
];

/**
 * Optional indexes for better query performance
 */
const PERFORMANCE_INDEXES = [
	{
		collectionId: "invites",
		key: "idx_server_active",
		type: IndexType.Key,
		attributes: ["serverId", "expiresAt"],
		description: "Improves lookup of active invites per server",
	},
	{
		collectionId: "invite_usage",
		key: "idx_invite_user",
		type: IndexType.Key,
		attributes: ["inviteCode", "userId"],
		description: "Improves duplicate usage check",
	},
	{
		collectionId: "memberships",
		key: "idx_user_memberships",
		type: IndexType.Key,
		attributes: ["userId"],
		description: "Improves user membership queries",
	},
	{
		collectionId: "memberships",
		key: "idx_server_members",
		type: IndexType.Key,
		attributes: ["serverId"],
		description: "Improves server member list queries",
	},
];

/**
 * Check if an index already exists
 */
async function indexExists(
	collectionId: string,
	indexKey: string,
): Promise<boolean> {
	try {
		const collection = await databases.getCollection(databaseId, collectionId);
		return collection.indexes.some((idx) => idx.key === indexKey);
	} catch (error) {
		console.error(`Error checking collection ${collectionId}:`, error);
		return false;
	}
}

/**
 * Create a unique index
 */
async function createIndex(config: {
	collectionId: string;
	key: string;
	type: IndexType;
	attributes: string[];
	description: string;
}) {
	const { collectionId, key, type, attributes, description } = config;

	try {
		// Check if index already exists
		const exists = await indexExists(collectionId, key);

		if (exists) {
			console.log(`⏭️  Index ${key} already exists on ${collectionId}`);
			return { success: true, skipped: true };
		}

		// Create the index
		await databases.createIndex(
			databaseId,
			collectionId,
			key,
			type,
			attributes,
			// Appwrite SDK doesn't directly accept 'unique' in createIndex for IndexType.Unique
			// The IndexType.Unique itself makes it unique
		);

		console.log(`✅ Created ${type === IndexType.Unique ? "UNIQUE" : "performance"} index: ${key} on ${collectionId}`);
		console.log(`   Attributes: ${attributes.join(", ")}`);
		console.log(`   ${description}`);

		return { success: true, skipped: false };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		// Check if error is due to duplicate data
		if (errorMessage.includes("duplicate") || errorMessage.includes("unique")) {
			console.error(`❌ Cannot create unique index ${key} on ${collectionId}`);
			console.error(`   Reason: Collection contains duplicate data`);
			console.error(`   Action: Clean up duplicates before retrying`);
			console.error(`   Query: SELECT ${attributes.join(", ")}, COUNT(*) FROM ${collectionId} GROUP BY ${attributes.join(", ")} HAVING COUNT(*) > 1`);
		} else {
			console.error(`❌ Failed to create index ${key} on ${collectionId}:`, errorMessage);
		}

		return { success: false, error: errorMessage };
	}
}

/**
 * Main migration function
 */
async function migrate() {
	console.log("🚀 Starting unique constraints migration...\n");

	let successCount = 0;
	let skipCount = 0;
	let failCount = 0;

	// Create unique indexes (critical for data integrity)
	console.log("📝 Creating UNIQUE indexes for data integrity:\n");

	for (const config of UNIQUE_INDEXES) {
		const result = await createIndex(config);
		if (result.success) {
			if (result.skipped) {
				skipCount++;
			} else {
				successCount++;
			}
		} else {
			failCount++;
		}
		console.log(); // Empty line between operations
	}

	// Create performance indexes (optional but recommended)
	console.log("\n📊 Creating performance indexes:\n");

	for (const config of PERFORMANCE_INDEXES) {
		const result = await createIndex(config);
		if (result.success) {
			if (result.skipped) {
				skipCount++;
			} else {
				successCount++;
			}
		} else {
			failCount++;
		}
		console.log(); // Empty line between operations
	}

	// Summary
	console.log("\n" + "=".repeat(60));
	console.log("📊 Migration Summary:");
	console.log(`   ✅ Created: ${successCount}`);
	console.log(`   ⏭️  Skipped: ${skipCount}`);
	console.log(`   ❌ Failed: ${failCount}`);
	console.log("=".repeat(60));

	if (failCount > 0) {
		console.log("\n⚠️  Some indexes failed to create. Review errors above.");
		console.log("   Common issues:");
		console.log("   1. Collection contains duplicate data (clean up first)");
		console.log("   2. Collection doesn't exist (check collection IDs)");
		console.log("   3. Insufficient permissions (check API key)");
		process.exit(1);
	}

	console.log("\n✅ Migration completed successfully!");
}

/**
 * Cleanup script to find and remove duplicates
 */
async function findDuplicates() {
	console.log("🔍 Searching for duplicate data...\n");

	try {
		// Check for duplicate invite codes
		console.log("Checking invites collection for duplicate codes...");
		const invites = await databases.listDocuments(databaseId, "invites");
		const codeCounts = new Map<string, number>();

		for (const invite of invites.documents) {
			const code = invite.code as string;
			codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
		}

		const duplicateCodes = Array.from(codeCounts.entries()).filter(
			([, count]) => count > 1,
		);

		if (duplicateCodes.length > 0) {
			console.log(`❌ Found ${duplicateCodes.length} duplicate invite codes:`);
			for (const [code, count] of duplicateCodes) {
				console.log(`   - Code "${code}" appears ${count} times`);
			}
		} else {
			console.log("✅ No duplicate invite codes found");
		}

		console.log();

		// Check for duplicate memberships
		console.log("Checking memberships collection for duplicates...");
		const memberships = await databases.listDocuments(databaseId, "memberships");
		const membershipKeys = new Map<string, number>();

		for (const membership of memberships.documents) {
			const key = `${membership.serverId}:${membership.userId}`;
			membershipKeys.set(key, (membershipKeys.get(key) || 0) + 1);
		}

		const duplicateMemberships = Array.from(membershipKeys.entries()).filter(
			([, count]) => count > 1,
		);

		if (duplicateMemberships.length > 0) {
			console.log(`❌ Found ${duplicateMemberships.length} duplicate memberships:`);
			for (const [key, count] of duplicateMemberships) {
				const [serverId, userId] = key.split(":");
				console.log(`   - Server ${serverId}, User ${userId}: ${count} memberships`);
			}
		} else {
			console.log("✅ No duplicate memberships found");
		}
	} catch (error) {
		console.error("Error checking for duplicates:", error);
	}
}

// Parse command line arguments
const command = process.argv[2];

if (command === "check") {
	findDuplicates().catch(console.error);
} else if (command === "migrate") {
	migrate().catch(console.error);
} else {
	console.log("Usage:");
	console.log("  bun scripts/add-unique-constraints.ts check   - Check for duplicate data");
	console.log("  bun scripts/add-unique-constraints.ts migrate - Apply unique constraints");
	process.exit(1);
}
