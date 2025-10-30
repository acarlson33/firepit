#!/usr/bin/env bun
/**
 * Setup script for moderation collections
 * Creates banned_users and muted_users collections with proper schema
 * 
 * Usage: bun run scripts/setup-moderation-collections.ts
 */

import { Client, Databases, ID, IndexType, Permission, Role } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";

async function createBannedUsersCollection() {
  console.log("Creating banned_users collection...");
  
  try {
    const collection = await databases.createCollection(
      databaseId,
      ID.unique(),
      "banned_users",
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
    
    console.log(`✓ Created collection: ${collection.$id}`);
    
    // Create attributes
    console.log("Creating attributes for banned_users...");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "serverId",
      255,
      true // required
    );
    console.log("  ✓ Created serverId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "userId",
      255,
      true // required
    );
    console.log("  ✓ Created userId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "bannedBy",
      255,
      true // required
    );
    console.log("  ✓ Created bannedBy attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "reason",
      1000,
      false, // optional
      ""
    );
    console.log("  ✓ Created reason attribute");
    
    await databases.createDatetimeAttribute(
      databaseId,
      collection.$id,
      "bannedAt",
      true // required
    );
    console.log("  ✓ Created bannedAt attribute");
    
    // Create indexes for better query performance
    console.log("Creating indexes for banned_users...");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "server_user_idx",
      IndexType.Key,
      ["serverId", "userId"],
      ["asc", "asc"]
    );
    console.log("  ✓ Created server_user index");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "server_idx",
      IndexType.Key,
      ["serverId"],
      ["asc"]
    );
    console.log("  ✓ Created server index");
    
    console.log(`\n✅ banned_users collection created successfully!`);
    console.log(`Collection ID: ${collection.$id}`);
    console.log(`\nAdd this to your .env.local:`);
    console.log(`APPWRITE_BANNED_USERS_COLLECTION_ID=${collection.$id}`);
    
    return collection.$id;
  } catch (error) {
    console.error("Error creating banned_users collection:", error);
    throw error;
  }
}

async function createMutedUsersCollection() {
  console.log("\nCreating muted_users collection...");
  
  try {
    const collection = await databases.createCollection(
      databaseId,
      ID.unique(),
      "muted_users",
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
    
    console.log(`✓ Created collection: ${collection.$id}`);
    
    // Create attributes
    console.log("Creating attributes for muted_users...");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "serverId",
      255,
      true // required
    );
    console.log("  ✓ Created serverId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "userId",
      255,
      true // required
    );
    console.log("  ✓ Created userId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "mutedBy",
      255,
      true // required
    );
    console.log("  ✓ Created mutedBy attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "reason",
      1000,
      false, // optional
      ""
    );
    console.log("  ✓ Created reason attribute");
    
    await databases.createDatetimeAttribute(
      databaseId,
      collection.$id,
      "mutedAt",
      true // required
    );
    console.log("  ✓ Created mutedAt attribute");
    
    // Create indexes for better query performance
    console.log("Creating indexes for muted_users...");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "server_user_idx",
      IndexType.Key,
      ["serverId", "userId"],
      ["asc", "asc"]
    );
    console.log("  ✓ Created server_user index");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "server_idx",
      IndexType.Key,
      ["serverId"],
      ["asc"]
    );
    console.log("  ✓ Created server index");
    
    console.log(`\n✅ muted_users collection created successfully!`);
    console.log(`Collection ID: ${collection.$id}`);
    console.log(`\nAdd this to your .env.local:`);
    console.log(`APPWRITE_MUTED_USERS_COLLECTION_ID=${collection.$id}`);
    
    return collection.$id;
  } catch (error) {
    console.error("Error creating muted_users collection:", error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Setting up moderation collections...\n");
  console.log(`Database: ${databaseId}\n`);
  
  try {
    const bannedUsersId = await createBannedUsersCollection();
    const mutedUsersId = await createMutedUsersCollection();
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ All moderation collections created successfully!");
    console.log("=".repeat(60));
    console.log("\n📝 Add these to your .env.local file:\n");
    console.log(`APPWRITE_BANNED_USERS_COLLECTION_ID=${bannedUsersId}`);
    console.log(`APPWRITE_MUTED_USERS_COLLECTION_ID=${mutedUsersId}`);
    console.log("\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
