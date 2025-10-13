/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Check and display the statuses collection attributes
 */
import { Client, Databases } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !project || !apiKey) {
	console.error("Missing required environment variables");
	process.exit(1);
}

const client = new Client()
	.setEndpoint(endpoint)
	.setProject(project)
	.setKey(apiKey);

const databases = new Databases(client);

async function checkStatusesCollection() {
	try {
		const collection = await databases.getCollection("main", "statuses");
		console.log("✅ Statuses collection exists");
		console.log(`📋 Collection ID: ${collection.$id}`);
		console.log(`📝 Name: ${collection.name}`);
		console.log(`🔒 Document Security: ${collection.documentSecurity}`);
		
		console.log("\n📊 Attributes:");
		const attributes = await databases.listAttributes("main", "statuses");
		
		const requiredAttributes = [
			"userId",
			"status",
			"customMessage",
			"lastSeenAt",
			"expiresAt",
			"isManuallySet"
		];
		
		const existingAttributes = new Set(
			attributes.attributes.map((attr: any) => attr.key)
		);
		
		for (const attr of requiredAttributes) {
			if (existingAttributes.has(attr)) {
				const attrInfo = attributes.attributes.find((a: any) => a.key === attr);
				if (attrInfo) {
					console.log(`  ✅ ${attr} (${attrInfo.type}, required: ${attrInfo.required})`);
				}
			} else {
				console.log(`  ❌ ${attr} - MISSING`);
			}
		}
		
		console.log("\n📑 Indexes:");
		const indexes = await databases.listIndexes("main", "statuses");
		for (const index of indexes.indexes) {
			console.log(`  - ${index.key}: ${index.attributes.join(", ")}`);
		}
		
	} catch (error) {
		const err = error as Error;
		console.error("❌ Error:", err.message);
		
		if (err.message.includes("Collection with the requested ID could not be found")) {
			console.log("\n⚠️  Statuses collection does not exist. Run: bun run scripts/setup-appwrite.ts");
		}
	}
}

void checkStatusesCollection();
