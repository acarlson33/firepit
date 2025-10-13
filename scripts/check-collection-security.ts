// Script to check and enable documentSecurity on collections
import { Client, Databases } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || "")
  .setProject(process.env.APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "";

const collections = [
  { id: process.env.APPWRITE_MESSAGES_COLLECTION_ID, name: "messages" },
  { id: process.env.APPWRITE_SERVERS_COLLECTION_ID, name: "servers" },
  { id: process.env.APPWRITE_CHANNELS_COLLECTION_ID, name: "channels" },
  { id: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID, name: "memberships" },
  { id: process.env.APPWRITE_AUDIT_COLLECTION_ID, name: "audit" },
  { id: process.env.APPWRITE_TYPING_COLLECTION_ID, name: "typing" },
];

async function main() {
  console.log("Checking collection security settings...\n");

  for (const collection of collections) {
    if (!collection.id) {
      console.log(`⏭️  Skipping ${collection.name} (not configured)`);
      continue;
    }

    try {
      const col = await databases.getCollection({
        databaseId: DATABASE_ID,
        collectionId: collection.id,
      });

      console.log(`📋 Collection: ${collection.name}`);
      console.log(`   ID: ${collection.id}`);
      console.log(`   Document Security: ${col.documentSecurity ? "✅ ENABLED" : "❌ DISABLED"}`);

      if (!col.documentSecurity) {
        console.log(`   ⚠️  WARNING: Document security is DISABLED!`);
        console.log(`   This means only "any" and "guests" permissions are allowed.`);
        console.log(`   To enable document-level permissions, run:`);
        console.log(`   bun run scripts/fix-collection-security.ts\n`);
      } else {
        console.log(`   ✓ Document-level permissions are enabled\n`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${collection.name}:`, error);
    }
  }
}

main().catch(console.error);
