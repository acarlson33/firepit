#!/usr/bin/env bun
/**
 * Check and fix the statuses collection permissions
 */

import { Client, Databases } from "node-appwrite";

const client = new Client()
	.setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
	.setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
	.setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "";
const STATUSES_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_STATUSES_COLLECTION_ID || "";

async function main() {
	console.log("🔍 Checking statuses collection...\n");

	try {
		// Get current collection settings
		const collection = await databases.getCollection(
			DATABASE_ID,
			STATUSES_COLLECTION_ID,
		);

		console.log("Current statuses collection settings:");
		console.log("- Name:", collection.name);
		console.log("- Document Security:", collection.documentSecurity);
		console.log("- Permissions:", JSON.stringify(collection.$permissions, null, 2));
		console.log("");

		if (!collection.documentSecurity) {
			console.log("❌ Document security is DISABLED");
			console.log("   This prevents document-level permissions from working.");
			console.log("");
			console.log("🔧 Enabling document security...");

			await databases.updateCollection(
				DATABASE_ID,
				STATUSES_COLLECTION_ID,
				collection.name,
				collection.$permissions,
				true, // Enable document security
				collection.enabled,
			);

			console.log("✅ Document security enabled!");
		} else {
			console.log("✅ Document security is already enabled");
		}

		// Check if collection permissions allow user-specific permissions
		const hasAnyRead = collection.$permissions.some((p) =>
			p.includes('read("any")'),
		);
		const hasCreatePermission = collection.$permissions.some(
			(p) => p.includes("create(") || p.includes('create("any")'),
		);

		console.log("");
		console.log("Permission analysis:");
		console.log("- Has read('any'):", hasAnyRead);
		console.log("- Has create permission:", hasCreatePermission);

		if (!hasCreatePermission) {
			console.log("");
			console.log("❌ Collection missing CREATE permission");
			console.log("   Users need permission to create status documents.");
			console.log("");
			console.log("🔧 Adding create('users') permission...");

			const updatedPermissions = [
				...collection.$permissions,
				'create("users")', // Allow authenticated users to create
			];

			await databases.updateCollection(
				DATABASE_ID,
				STATUSES_COLLECTION_ID,
				collection.name,
				updatedPermissions,
				true, // Document security
				collection.enabled,
			);

			console.log("✅ Create permission added!");
		}

		console.log("");
		console.log("✅ Statuses collection is properly configured!");
		console.log("");
		console.log("Summary:");
		console.log("- Document security: enabled");
		console.log("- Users can: create status documents");
		console.log("- Documents can have: user-specific permissions");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

await main();
