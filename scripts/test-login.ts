#!/usr/bin/env bun
/**
 * Quick test script to verify login works with the Appwrite SDK
 */
import { Client, Account } from "appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT || "https://nyc.cloud.appwrite.io/v1";
const project = process.env.APPWRITE_PROJECT_ID || "68b230a0002245833242";

// Get credentials from command line or use defaults
const email = process.argv[2] || "test@example.com";
const password = process.argv[3] || "password123";

console.log("Testing Appwrite SDK login...");
console.log(`Endpoint: ${endpoint}`);
console.log(`Project: ${project}`);
console.log(`Email: ${email}\n`);

const client = new Client().setEndpoint(endpoint).setProject(project);
const account = new Account(client);

try {
  // Test with correct object syntax
  const session = await account.createEmailPasswordSession({
    email,
    password,
  });

  console.log("✅ Login successful!");
  console.log(`Session ID: ${session.$id}`);
  console.log(`User ID: ${session.userId}`);
  console.log(`Session expires: ${session.expire}`);
  
  // Cleanup - delete the test session
  await account.deleteSession({ sessionId: session.$id });
  console.log("\n✅ Session cleaned up");
  
} catch (error) {
  console.error("❌ Login failed:");
  console.error(error);
  process.exit(1);
}
