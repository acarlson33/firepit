#!/usr/bin/env bun
/**
 * Fix typing collection permissions
 * 
 * This script ensures typing documents have proper read permissions
 * so that typing indicators can be seen by all users.
 */

import { Client, Databases, Permission, Role, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID as string;
const TYPING_COLLECTION_ID = process.env.APPWRITE_TYPING_COLLECTION_ID as string;

if (!ENDPOINT || !PROJECT || !API_KEY || !DATABASE_ID || !TYPING_COLLECTION_ID) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT)
  .setKey(API_KEY);

const databases = new Databases(client);

async function fixTypingPermissions() {
  console.log("[fix-typing] Fetching all typing documents...");
  
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      TYPING_COLLECTION_ID,
      [Query.limit(100)]
    );

    console.log(`[fix-typing] Found ${response.documents.length} typing documents`);

    for (const doc of response.documents) {
      const userId = doc.userId as string;
      
      // Set proper permissions: anyone can read, only creator can update/delete
      const permissions = [
        Permission.read(Role.any()),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ];

      try {
        await databases.updateDocument(
          DATABASE_ID,
          TYPING_COLLECTION_ID,
          doc.$id,
          {},
          permissions
        );
        console.log(`[fix-typing] ✓ Fixed permissions for document ${doc.$id}`);
      } catch (error) {
        console.error(`[fix-typing] ✗ Failed to fix document ${doc.$id}:`, error);
      }
    }

    console.log("[fix-typing] ✅ Done!");
  } catch (error) {
    console.error("[fix-typing] Error:", error);
    process.exit(1);
  }
}

void fixTypingPermissions();
