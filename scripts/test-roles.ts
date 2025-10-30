/**
 * Test script to create a sample role and verify the role management system.
 * Run with: bun run scripts/test-roles.ts
 */
import { Client, Databases, Query, ID } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "main";

if (!endpoint || !project || !apiKey) {
	throw new Error("Missing Appwrite configuration");
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (typeof (client as unknown as { setKey?: (k: string) => void }).setKey === "function") {
	(client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

async function main() {
	console.log("🔍 Testing role management system...\n");

	// 1. List existing servers
	console.log("📋 Fetching servers...");
	const serversResponse = await databases.listDocuments(databaseId, "servers", [
		Query.limit(1),
	]);

	if (serversResponse.documents.length === 0) {
		console.log("❌ No servers found. Please create a server first.");
		return;
	}

	const testServer = serversResponse.documents[0];
	console.log(`✅ Found server: ${testServer.name} (ID: ${testServer.$id})\n`);

	// 2. List existing roles
	console.log("📋 Checking existing roles...");
	const rolesResponse = await databases.listDocuments(databaseId, "roles", [
		Query.equal("serverId", testServer.$id),
	]);
	console.log(`✅ Found ${rolesResponse.documents.length} existing roles\n`);

	// 3. Create a test role
	console.log("➕ Creating test Moderator role...");
	const testRole = {
		serverId: testServer.$id,
		name: "Moderator",
		color: "#3498db",
		position: 5,
		readMessages: true,
		sendMessages: true,
		manageMessages: true,
		manageChannels: false,
		manageRoles: false,
		manageServer: false,
		mentionEveryone: true,
		administrator: false,
		mentionable: true,
		memberCount: 0,
	};

	const createdRole = await databases.createDocument(
		databaseId,
		"roles",
		ID.unique(),
		testRole
	);
	console.log(`✅ Created role: ${createdRole.name} (ID: ${createdRole.$id})`);
	console.log(`   Color: ${createdRole.color}`);
	console.log(`   Position: ${createdRole.position}`);
	console.log(`   Permissions:`, {
		readMessages: createdRole.readMessages,
		sendMessages: createdRole.sendMessages,
		manageMessages: createdRole.manageMessages,
		administrator: createdRole.administrator,
	});
	console.log("");

	// 4. Update the role
	console.log("✏️  Updating role position...");
	const updatedRole = await databases.updateDocument(
		databaseId,
		"roles",
		createdRole.$id,
		{ position: 10 }
	);
	console.log(`✅ Updated role position to: ${updatedRole.position}\n`);

	// 5. List all roles for the server
	console.log("📋 Listing all roles for server...");
	const allRoles = await databases.listDocuments(databaseId, "roles", [
		Query.equal("serverId", testServer.$id),
		Query.orderDesc("position"),
	]);
	console.log(`✅ Found ${allRoles.documents.length} roles:`);
	for (const role of allRoles.documents) {
		console.log(`   - ${role.name} (pos: ${role.position}, color: ${role.color})`);
	}
	console.log("");

	// 6. Clean up - delete the test role
	console.log("🗑️  Cleaning up test role...");
	await databases.deleteDocument(databaseId, "roles", createdRole.$id);
	console.log(`✅ Deleted test role\n`);

	console.log("✨ Role management system test complete!");
	console.log("\n📝 Summary:");
	console.log(`   - Database: ${databaseId}`);
	console.log(`   - Collections: roles, role_assignments, channel_permission_overrides`);
	console.log(`   - Test server: ${testServer.name}`);
	console.log(`   - Operations tested: CREATE, READ, UPDATE, DELETE`);
	console.log("\n🎉 All operations successful!");
}

main().catch((error) => {
	console.error("❌ Error:", error);
	process.exit(1);
});
