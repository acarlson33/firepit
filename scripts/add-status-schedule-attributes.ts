/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Migration script to add expiresAt and isManuallySet attributes to statuses collection
 */
import { Client, Databases } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
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
const DB_ID = "main";
const COLLECTION_ID = "statuses";

async function addMissingAttributes() {
	console.log("🔄 Checking statuses collection...\n");
	
	try {
		// Check existing attributes
		const attributes = await databases.listAttributes(DB_ID, COLLECTION_ID);
		const existingKeys = new Set(attributes.attributes.map((attr: any) => attr.key));
		
		// Add expiresAt (string/datetime attribute)
		if (!existingKeys.has("expiresAt")) {
			console.log("➕ Adding expiresAt attribute...");
			try {
				await databases.createDatetimeAttribute(
					DB_ID,
					COLLECTION_ID,
					"expiresAt",
					false, // not required
				);
				console.log("✅ Added expiresAt attribute");
			} catch (error) {
				const err = error as Error;
				console.error(`❌ Failed to add expiresAt: ${err.message}`);
			}
		} else {
			console.log("✓ expiresAt already exists");
		}
		
		// Add isManuallySet (boolean attribute)
		if (!existingKeys.has("isManuallySet")) {
			console.log("➕ Adding isManuallySet attribute...");
			try {
				await databases.createBooleanAttribute(
					DB_ID,
					COLLECTION_ID,
					"isManuallySet",
					false, // not required
				);
				console.log("✅ Added isManuallySet attribute");
			} catch (error) {
				const err = error as Error;
				console.error(`❌ Failed to add isManuallySet: ${err.message}`);
			}
		} else {
			console.log("✓ isManuallySet already exists");
		}
		
		console.log("\n⏳ Waiting for attributes to be available (this may take a few seconds)...");
		
		// Wait a bit for attributes to become available
		await new Promise(resolve => setTimeout(resolve, 3000));
		
		// Verify the attributes were added
		console.log("\n🔍 Verifying attributes...");
		const updatedAttributes = await databases.listAttributes(DB_ID, COLLECTION_ID);
		const updatedKeys = new Set(updatedAttributes.attributes.map((attr: any) => attr.key));
		
		if (updatedKeys.has("expiresAt") && updatedKeys.has("isManuallySet")) {
			console.log("✅ All required attributes are present!");
			console.log("\n📊 Current attributes:");
			for (const attr of updatedAttributes.attributes) {
				const a = attr as any;
				console.log(`  - ${String(a.key)} (${String(a.type)}, required: ${String(a.required)}, status: ${String(a.status)})`);
			}
		} else {
			console.log("⚠️  Some attributes are still missing. They may still be processing.");
			console.log("   Please wait a moment and run: bun run scripts/check-statuses-collection.ts");
		}
		
	} catch (error) {
		const err = error as Error;
		console.error("❌ Error:", err.message);
		process.exit(1);
	}
}

void addMissingAttributes();
