#!/usr/bin/env bun
/**
 * Script to add the 'attachments' column to messages and direct_messages collections
 * This enables file attachments feature beyond images.
 */

import { Client, Databases } from "node-appwrite";

const client = new Client();
const databases = new Databases(client);

// Initialize Appwrite client
client
	.setEndpoint(process.env.APPWRITE_ENDPOINT || "")
	.setProject(process.env.APPWRITE_PROJECT_ID || "")
	.setKey(process.env.APPWRITE_API_KEY || "");

const databaseId = process.env.APPWRITE_DATABASE_ID || "main";
const messagesCollectionId = process.env.APPWRITE_MESSAGES_COLLECTION_ID || "messages";
const dmCollectionId = process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID || "direct_messages";

async function addAttachmentsColumn() {
	console.log("🔧 Adding attachments column to collections...\n");

	try {
		// Add attachments column to messages collection
		console.log("📝 Adding attachments to messages collection...");
		await databases.createStringAttribute(
			databaseId,
			messagesCollectionId,
			"attachments",
			10000, // Large enough for JSON array of file attachments
			false, // Not required
			undefined, // No default
			false // Not an array - we'll store JSON
		);
		console.log("✅ Added attachments column to messages collection");

		// Wait a bit for the attribute to be created
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Add attachments column to direct_messages collection
		console.log("\n📝 Adding attachments to direct_messages collection...");
		await databases.createStringAttribute(
			databaseId,
			dmCollectionId,
			"attachments",
			10000, // Large enough for JSON array of file attachments
			false, // Not required
			undefined, // No default
			false // Not an array - we'll store JSON
		);
		console.log("✅ Added attachments column to direct_messages collection");

		console.log("\n🎉 Successfully added attachments columns to both collections!");
		console.log("\nNote: Attachments will be stored as JSON strings containing FileAttachment arrays.");
		console.log("Example: [{fileId, fileName, fileSize, fileType, fileUrl}]");
	} catch (error) {
		if (error instanceof Error) {
			console.error("❌ Error:", error.message);
			// Check if attribute already exists
			if (error.message.includes("already exists") || error.message.includes("Attribute already exists")) {
				console.log("\n⚠️  Attachments column may already exist. Checking...");
			} else {
				throw error;
			}
		} else {
			throw error;
		}
	}
}

addAttachmentsColumn()
	.then(() => {
		console.log("\n✨ Script completed successfully!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\n❌ Script failed:", error);
		process.exit(1);
	});
