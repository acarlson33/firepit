// Script to enable documentSecurity on all collections
import { Client, Databases } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !project || !apiKey) {
  throw new Error("Missing environment variables");
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project)
  .setKey(apiKey);

const databases = new Databases(client);

const DATABASE_ID = "main";

const collections = [
  { id: process.env.APPWRITE_MESSAGES_COLLECTION_ID, name: "messages" },
  { id: process.env.APPWRITE_SERVERS_COLLECTION_ID, name: "servers" },
  { id: process.env.APPWRITE_CHANNELS_COLLECTION_ID, name: "channels" },
  { id: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID, name: "memberships" },
  { id: process.env.APPWRITE_AUDIT_COLLECTION_ID, name: "audit" },
  { id: process.env.APPWRITE_TYPING_COLLECTION_ID, name: "typing" },
];

async function main() {
  console.log("Enabling document security on all collections...\n");

  for (const collection of collections) {
    if (!collection.id) {
      console.log(`⏭️  Skipping ${collection.name} (not configured)`);
      continue;
    }

    try {
      // Get current collection settings
      const col = await databases.getCollection({
        databaseId: DATABASE_ID,
        collectionId: collection.id,
      });

      if (col.documentSecurity) {
        console.log(`✓ ${collection.name}: Already enabled`);
        continue;
      }

      // Update collection to enable documentSecurity
      await databases.updateCollection({
        databaseId: DATABASE_ID,
        collectionId: collection.id,
        name: col.name,
        documentSecurity: true,
        enabled: col.enabled,
      });

      console.log(`✅ ${collection.name}: Enabled document security`);
    } catch (error) {
      console.error(`❌ Error updating ${collection.name}:`, error);
    }
  }

  console.log("\n✨ Done!");
}

main().catch(console.error);
