#!/usr/bin/env bun
import { Client, Databases } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

// Collections we want to KEEP (the new ones we just created)
const _keepCollections = [
  "690150d60012de4140d7", // banned_users
  "690150d7001b42d0f38f", // muted_users
  "6901515b001869cf7406", // audit (new with better schema)
];

// Collections to potentially DELETE (old duplicates)
const _checkForDeletion = [
  { id: "audit", name: "Audit (old)", reason: "Using new audit collection with better schema" },
  { id: "69014be7001cc3293a15", name: "roles (new)", reason: "Old 'Roles' collection has more structure - might be in use" },
];

async function main() {
  console.log("=== DUPLICATE COLLECTION CLEANUP ===\n");
  
  const result = await databases.listCollections("main");
  
  // Find actual duplicates
  type CollectionInfo = { $id: string; name: string; attributes: unknown[]; indexes: unknown[] };
  const byName: Record<string, CollectionInfo[]> = {};
  result.collections.forEach((c) => {
    if (!byName[c.name.toLowerCase()]) {
      byName[c.name.toLowerCase()] = [];
    }
    byName[c.name.toLowerCase()].push(c as CollectionInfo);
  });

  console.log("Collections with potential duplicates:\n");
  
  for (const [name, collections] of Object.entries(byName)) {
    if (collections.length > 1) {
      console.log(`📋 ${name}:`);
      for (const coll of collections) {
        console.log(`   - "${coll.name}" (ID: ${coll.$id})`);
        console.log(`     Attributes: ${coll.attributes.length}, Indexes: ${coll.indexes.length}`);
        
        // Check if it has documents
        try {
          const docs = await databases.listDocuments("main", coll.$id, []);
          console.log(`     Documents: ${docs.total}`);
        } catch (e) {
          console.log(`     Documents: Unable to count`);
        }
      }
      console.log("");
    }
  }
  
  console.log("\n=== RECOMMENDATIONS ===\n");
  console.log("✅ KEEP these collections:");
  console.log("   - banned_users (690150d60012de4140d7) - NEW, in use");
  console.log("   - muted_users (690150d7001b42d0f38f) - NEW, in use");
  console.log("   - audit (6901515b001869cf7406) - NEW with better schema, in .env.local");
  console.log("");
  console.log("❌ SAFE TO DELETE:");
  console.log("   - Audit (audit) - OLD schema, replaced by new audit collection");
  console.log("");
  console.log("⚠️  INVESTIGATE:");
  console.log("   - Roles (roles) vs roles (69014be7001cc3293a15)");
  console.log("     Check which has data and is being used");
}

main().catch(console.error);
