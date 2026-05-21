// Test script to verify server client authentication
import { getServerClient } from "../src/lib/appwrite-server";
import { getEnvConfig } from "../src/lib/appwrite-core";

async function test() {
  try {
    const { databases } = getServerClient();
    const env = getEnvConfig();
    
    process.stdout.write("Testing server client authentication...\n");
    
    // Try to list databases (requires API key)
    const dbs = await databases.list();
    process.stdout.write(`✓ API key is valid - found ${dbs.total} databases\n`);
    
    // Try to get a collection (requires API key)
    const collection = await databases.getCollection({
      databaseId: env.databaseId,
      collectionId: env.collections.messages,
    });
    
    process.stdout.write(`✓ Can access messages collection\n`);
    process.stdout.write(`  Document Security: ${collection.documentSecurity ? "ENABLED" : "DISABLED"}\n`);
    
  } catch (error) {
    process.stderr.write(`✗ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

await test();
