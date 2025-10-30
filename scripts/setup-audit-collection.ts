#!/usr/bin/env bun
/**
 * Setup script for audit collection
 * Creates audit collection for tracking moderation actions and system events
 * 
 * Usage: bun run scripts/setup-audit-collection.ts
 */

import { Client, Databases, ID, IndexType, Permission, Role } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";

async function createAuditCollection() {
  console.log("Creating audit collection...");
  
  try {
    const collection = await databases.createCollection(
      databaseId,
      ID.unique(),
      "audit",
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
    
    console.log(`✓ Created collection: ${collection.$id}`);
    
    // Create attributes
    console.log("Creating attributes for audit...");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "action",
      255,
      true // required
    );
    console.log("  ✓ Created action attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "targetId",
      255,
      true // required
    );
    console.log("  ✓ Created targetId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "actorId",
      255,
      true // required
    );
    console.log("  ✓ Created actorId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "serverId",
      255,
      false // optional - not all actions are server-specific
    );
    console.log("  ✓ Created serverId attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "reason",
      1000,
      false, // optional
      ""
    );
    console.log("  ✓ Created reason attribute");
    
    await databases.createStringAttribute(
      databaseId,
      collection.$id,
      "details",
      5000,
      false, // optional
      ""
    );
    console.log("  ✓ Created details attribute");
    
    // Wait for attributes to be fully available before creating indexes
    console.log("\nWaiting for attributes to be ready...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log("✓ Attributes ready");
    
    // Create indexes for better query performance
    console.log("\nCreating indexes for audit...");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "server_idx",
      IndexType.Key,
      ["serverId"],
      ["desc"]
    );
    console.log("  ✓ Created server index");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "actor_idx",
      IndexType.Key,
      ["actorId"],
      ["desc"]
    );
    console.log("  ✓ Created actor index");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "target_idx",
      IndexType.Key,
      ["targetId"],
      ["desc"]
    );
    console.log("  ✓ Created target index");
    
    await databases.createIndex(
      databaseId,
      collection.$id,
      "action_idx",
      IndexType.Key,
      ["action"],
      ["desc"]
    );
    console.log("  ✓ Created action index");
    
    console.log(`\n✅ audit collection created successfully!`);
    console.log(`Collection ID: ${collection.$id}`);
    console.log(`\nAdd this to your .env.local:`);
    console.log(`APPWRITE_AUDIT_COLLECTION_ID=${collection.$id}`);
    
    return collection.$id;
  } catch (error) {
    console.error("Error creating audit collection:", error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Setting up audit collection...\n");
  console.log(`Database: ${databaseId}\n`);
  
  try {
    const auditId = await createAuditCollection();
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Audit collection created successfully!");
    console.log("=".repeat(60));
    console.log("\n📝 Add this to your .env.local file:\n");
    console.log(`APPWRITE_AUDIT_COLLECTION_ID=${auditId}`);
    console.log("\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
