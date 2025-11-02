#!/usr/bin/env bun
import { Client, Databases } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new Databases(client);

console.log("=== CHECKING FOR DUPLICATE COLLECTION NAMES ===\n");
const result = await databases.listCollections("main");

// Group collections by name
const byName: Record<string, Array<{ $id: string; name: string; $createdAt: string }>> = {};
result.collections.forEach((c) => {
  if (!byName[c.name]) {
    byName[c.name] = [];
  }
  byName[c.name].push(c);
});

// Find duplicates
let foundDuplicates = false;
Object.entries(byName).forEach(([name, collections]) => {
  if (collections.length > 1) {
    foundDuplicates = true;
    console.log(`⚠️  Multiple collections with name '${name}':`);
    collections.forEach((c) => {
      console.log(`   - ID: ${c.$id}, Created: ${c.$createdAt}`);
    });
    console.log("");
  }
});

if (!foundDuplicates) {
  console.log("✅ No duplicate collection names found!");
}

// List all collections
console.log("\n=== ALL COLLECTIONS IN DATABASE ===");
console.log(`Total: ${result.collections.length} collections\n`);
result.collections.sort((a, b) => a.name.localeCompare(b.name));
result.collections.forEach((c) => {
  console.log(`  - ${c.name.padEnd(35)} (ID: ${c.$id})`);
});
