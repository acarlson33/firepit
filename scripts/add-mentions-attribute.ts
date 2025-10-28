/**
 * Add mentions attribute to messages and direct_messages collections
 */
import { Client, Databases } from "node-appwrite";

const client = new Client()
	.setEndpoint(process.env.APPWRITE_ENDPOINT || "")
	.setProject(process.env.APPWRITE_PROJECT_ID || "")
	.setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

const DB_ID = process.env.APPWRITE_DATABASE_ID || "main";
const MESSAGES_COLLECTION = process.env.APPWRITE_MESSAGES_COLLECTION_ID || "messages";
const DIRECT_MESSAGES_COLLECTION = process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID || "direct_messages";

async function addMentionsAttribute() {
	try {
		console.log("Adding mentions attribute to messages collection...");
		try {
			await databases.createStringAttribute(
				DB_ID,
				MESSAGES_COLLECTION,
				"mentions",
				64,
				false, // not required
				undefined, // no default
				true // is array
			);
			console.log("✓ Added mentions to messages collection");
		} catch (error) {
			if (error instanceof Error && error.message.includes("already exists")) {
				console.log("✓ mentions attribute already exists in messages collection");
			} else {
				throw error;
			}
		}

		console.log("\nAdding mentions attribute to direct_messages collection...");
		try {
			await databases.createStringAttribute(
				DB_ID,
				DIRECT_MESSAGES_COLLECTION,
				"mentions",
				64,
				false, // not required
				undefined, // no default
				true // is array
			);
			console.log("✓ Added mentions to direct_messages collection");
		} catch (error) {
			if (error instanceof Error && error.message.includes("already exists")) {
				console.log("✓ mentions attribute already exists in direct_messages collection");
			} else {
				throw error;
			}
		}

		console.log("\n✅ All mentions attributes added successfully!");
	} catch (error) {
		console.error("❌ Error adding mentions attributes:", error);
		process.exit(1);
	}
}

void addMentionsAttribute();
