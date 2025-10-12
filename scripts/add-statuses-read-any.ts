#!/usr/bin/env bun
/**
 * Add read("any") permission to statuses collection
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
	console.log("🔧 Adding read('any') to statuses collection...\n");

	try {
		const collection = await databases.getCollection(
			DATABASE_ID,
			STATUSES_COLLECTION_ID,
		);

		console.log("Current permissions:");
		console.log(JSON.stringify(collection.$permissions, null, 2));
		console.log("");

		// Add read("any") if not present
		const hasReadAny = collection.$permissions.some((p) => p === 'read("any")');

		if (hasReadAny) {
			console.log("✅ Collection already has read('any') permission");
			return;
		}

		const updatedPermissions = ['read("any")', ...collection.$permissions];

		await databases.updateCollection(
			DATABASE_ID,
			STATUSES_COLLECTION_ID,
			collection.name,
			updatedPermissions,
			true, // Document security
			collection.enabled,
		);

		console.log("✅ Successfully added read('any') permission!");
		console.log("");
		console.log("New permissions:");
		console.log(JSON.stringify(updatedPermissions, null, 2));
		console.log("");
		console.log("✅ Users can now set read('any') on status documents");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

await main();
