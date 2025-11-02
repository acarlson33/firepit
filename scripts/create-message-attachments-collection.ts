#!/usr/bin/env bun
/**
 * Script to create message_attachments collection
 * This solves the attribute limit issue by storing attachments separately
 */

import { Client, Databases, IndexType, Permission, Role } from "node-appwrite";

const client = new Client();
const databases = new Databases(client);

// Initialize Appwrite client
client
	.setEndpoint(process.env.APPWRITE_ENDPOINT || "")
	.setProject(process.env.APPWRITE_PROJECT_ID || "")
	.setKey(process.env.APPWRITE_API_KEY || "");

const databaseId = process.env.APPWRITE_DATABASE_ID || "main";
const collectionId = "message_attachments";

async function createMessageAttachmentsCollection() {
	console.log("🔧 Creating message_attachments collection...\n");

	try {
		// Create collection
		console.log("📝 Creating collection...");
		await databases.createCollection(
			databaseId,
			collectionId,
			"Message Attachments",
			[
				Permission.read(Role.any()),
				Permission.create(Role.users()),
				Permission.update(Role.users()),
				Permission.delete(Role.users()),
			],
			false, // Document security disabled (use collection-level permissions)
			true // Enabled
		);
		console.log("✅ Collection created");

		// Wait for collection to be ready
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Create attributes
		console.log("\n📝 Creating attributes...");

		// messageId - Foreign key to messages or direct_messages
		await databases.createStringAttribute(
			databaseId,
			collectionId,
			"messageId",
			128,
			true // Required
		);
		console.log("  ✅ messageId attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// messageType - 'channel' or 'dm'
		await databases.createEnumAttribute(
			databaseId,
			collectionId,
			"messageType",
			["channel", "dm"],
			true // Required, no default
		);
		console.log("  ✅ messageType attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// fileId - Appwrite Storage file ID
		await databases.createStringAttribute(databaseId, collectionId, "fileId", 128, true);
		console.log("  ✅ fileId attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// fileName - Original filename
		await databases.createStringAttribute(databaseId, collectionId, "fileName", 255, true);
		console.log("  ✅ fileName attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// fileSize - Size in bytes
		await databases.createIntegerAttribute(databaseId, collectionId, "fileSize", true);
		console.log("  ✅ fileSize attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// fileType - MIME type
		await databases.createStringAttribute(databaseId, collectionId, "fileType", 128, true);
		console.log("  ✅ fileType attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// fileUrl - Full URL to file
		await databases.createStringAttribute(databaseId, collectionId, "fileUrl", 2000, true);
		console.log("  ✅ fileUrl attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// thumbnailUrl - Optional thumbnail for videos/documents
		await databases.createStringAttribute(
			databaseId,
			collectionId,
			"thumbnailUrl",
			2000,
			false // Optional
		);
		console.log("  ✅ thumbnailUrl attribute created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Create indexes
		console.log("\n📝 Creating indexes...");

		await databases.createIndex(
			databaseId,
			collectionId,
			"messageId_idx",
			IndexType.Key,
			["messageId"],
			["asc"]
		);
		console.log("  ✅ messageId_idx index created");
		await new Promise((resolve) => setTimeout(resolve, 1000));

		await databases.createIndex(
			databaseId,
			collectionId,
			"messageType_idx",
			IndexType.Key,
			["messageType"],
			["asc"]
		);
		console.log("  ✅ messageType_idx index created");

		console.log("\n🎉 Successfully created message_attachments collection!");
		console.log("\n📋 Collection Details:");
		console.log("  - ID: message_attachments");
		console.log("  - Attributes: 8 (messageId, messageType, fileId, fileName, fileSize, fileType, fileUrl, thumbnailUrl)");
		console.log("  - Indexes: 2 (messageId, messageType)");
		console.log("  - Permissions: read(any), create/update/delete(users)");

		console.log("\n📝 Next Steps:");
		console.log("  1. Add APPWRITE_MESSAGE_ATTACHMENTS_COLLECTION_ID to .env.local");
		console.log("  2. Update message APIs to support attachments");
		console.log("  3. Integrate FileUploadButton into chat UI");
		console.log("  4. Test end-to-end file attachment flow");
	} catch (error) {
		if (error instanceof Error) {
			console.error("❌ Error:", error.message);
			if (
				error.message.includes("already exists") ||
				error.message.includes("Collection with the requested ID already exists")
			) {
				console.log("\n⚠️  Collection may already exist.");
			} else {
				throw error;
			}
		} else {
			throw error;
		}
	}
}

createMessageAttachmentsCollection()
	.then(() => {
		console.log("\n✨ Script completed successfully!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\n❌ Script failed:", error);
		process.exit(1);
	});
