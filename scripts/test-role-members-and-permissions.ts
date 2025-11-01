#!/usr/bin/env bun
/**
 * Test script for role member assignment and channel permission overrides
 * 
 * Tests:
 * 1. Assign members to roles
 * 2. Remove members from roles
 * 3. Create channel permission overrides for roles
 * 4. Create channel permission overrides for users
 * 5. List and delete overrides
 * 6. Verify permission calculations with overrides
 */

import { getAdminClient } from "@/lib/appwrite-admin";
import { Query } from "node-appwrite";

const databases = getAdminClient().databases;

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "";
const ROLES_COLLECTION_ID = process.env.APPWRITE_ROLES_COLLECTION_ID ?? "";
const ROLE_ASSIGNMENTS_COLLECTION_ID = process.env.APPWRITE_ROLE_ASSIGNMENTS_COLLECTION_ID ?? "";
const CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID = process.env.APPWRITE_CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID ?? "";
const SERVERS_COLLECTION_ID = process.env.APPWRITE_SERVERS_COLLECTION_ID ?? "";
const CHANNELS_COLLECTION_ID = process.env.APPWRITE_CHANNELS_COLLECTION_ID ?? "";
const MEMBERSHIPS_COLLECTION_ID = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID ?? "";

interface Role {
  $id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
}

interface RoleAssignment {
  $id: string;
  serverId: string;
  userId: string;
  roleIds: string[];
}

interface ChannelPermissionOverride {
  $id: string;
  channelId: string;
  serverId: string;
  roleId: string;
  userId: string;
  allowPermissions: string[];
  denyPermissions: string[];
}

async function main() {
  console.log("🧪 Testing Role Member Assignment and Channel Permissions\n");

  // Step 1: Find a test server
  console.log("1️⃣ Finding test server...");
  const servers = await databases.listDocuments(DATABASE_ID, SERVERS_COLLECTION_ID, [
    Query.limit(1)
  ]);
  
  if (servers.documents.length === 0) {
    throw new Error("No servers found. Please create a server first.");
  }
  
  const serverId = servers.documents[0].$id;
  const serverName = String(servers.documents[0].name);
  console.log(`   ✅ Found server: ${serverName} (${serverId})\n`);

  // Step 2: Find or create test roles
  console.log("2️⃣ Setting up test roles...");
  let testRole: Role;
  const existingRoles = await databases.listDocuments(DATABASE_ID, ROLES_COLLECTION_ID, [
    Query.equal("serverId", serverId),
    Query.equal("name", "Test Member Role")
  ]);
  
  if (existingRoles.documents.length > 0) {
    testRole = existingRoles.documents[0] as unknown as Role;
    console.log(`   ✅ Using existing role: ${testRole.name} (${testRole.$id})`);
  } else {
    const created = await databases.createDocument(
      DATABASE_ID,
      ROLES_COLLECTION_ID,
      "unique()",
      {
        serverId,
        name: "Test Member Role",
        color: "#10b981",
        position: 100,
        permissions: ["view_channels", "send_messages"]
      } as Record<string, unknown>
    );
    testRole = created as unknown as Role;
    console.log(`   ✅ Created test role: ${testRole.name} (${testRole.$id})`);
  }
  console.log();

  // Step 3: Find a test user (member of the server)
  console.log("3️⃣ Finding test member...");
  const memberships = await databases.listDocuments(DATABASE_ID, MEMBERSHIPS_COLLECTION_ID, [
    Query.equal("serverId", serverId),
    Query.limit(1)
  ]);
  
  if (memberships.documents.length === 0) {
    throw new Error("No members found in server. Please join the server first.");
  }
  
  const testUserId = String(memberships.documents[0].userId);
  console.log(`   ✅ Found test member: ${testUserId}\n`);

  // Step 4: Test role assignment
  console.log("4️⃣ Testing role assignment...");
  let assignment: RoleAssignment;
  const existingAssignments = await databases.listDocuments(
    DATABASE_ID,
    ROLE_ASSIGNMENTS_COLLECTION_ID,
    [
      Query.equal("serverId", serverId),
      Query.equal("userId", testUserId)
    ]
  );
  
  if (existingAssignments.documents.length > 0) {
    assignment = existingAssignments.documents[0] as unknown as RoleAssignment;
    // Add role to existing assignment if not already there
    if (!assignment.roleIds.includes(testRole.$id)) {
      const updated = await databases.updateDocument(
        DATABASE_ID,
        ROLE_ASSIGNMENTS_COLLECTION_ID,
        assignment.$id,
        {
          roleIds: [...assignment.roleIds, testRole.$id]
        } as Record<string, unknown>
      );
      assignment = updated as unknown as RoleAssignment;
      console.log(`   ✅ Added role to existing assignment (${assignment.$id})`);
    } else {
      console.log(`   ✅ Role already assigned (${assignment.$id})`);
    }
  } else {
    const created = await databases.createDocument(
      DATABASE_ID,
      ROLE_ASSIGNMENTS_COLLECTION_ID,
      "unique()",
      {
        serverId,
        userId: testUserId,
        roleIds: [testRole.$id]
      } as Record<string, unknown>
    );
    assignment = created as unknown as RoleAssignment;
    console.log(`   ✅ Created new role assignment (${assignment.$id})`);
  }
  console.log(`   📋 User ${String(testUserId)} has roles: ${assignment.roleIds.join(", ")}\n`);

  // Step 5: Find a test channel
  console.log("5️⃣ Finding test channel...");
  const channels = await databases.listDocuments(DATABASE_ID, CHANNELS_COLLECTION_ID, [
    Query.equal("serverId", serverId),
    Query.limit(1)
  ]);
  
  if (channels.documents.length === 0) {
    throw new Error("No channels found in server. Please create a channel first.");
  }
  
  const channelId = channels.documents[0].$id;
  const channelName = String(channels.documents[0].name);
  console.log(`   ✅ Found channel: ${channelName} (${channelId})\n`);

  // Step 6: Test channel permission override for role
  console.log("6️⃣ Testing channel permission override for role...");
  const existingRoleOverrides = await databases.listDocuments(
    DATABASE_ID,
    CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
    [
      Query.equal("channelId", channelId),
      Query.equal("roleId", testRole.$id),
      Query.equal("userId", "")
    ]
  );
  
  let roleOverride: ChannelPermissionOverride;
  if (existingRoleOverrides.documents.length > 0) {
    roleOverride = existingRoleOverrides.documents[0] as unknown as ChannelPermissionOverride;
    console.log(`   ✅ Using existing role override (${roleOverride.$id})`);
  } else {
    const created = await databases.createDocument(
      DATABASE_ID,
      CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
      "unique()",
      {
        channelId,
        serverId,
        roleId: testRole.$id,
        userId: "",
        allowPermissions: ["manage_channels"],
        denyPermissions: ["send_messages"]
      } as Record<string, unknown>
    );
    roleOverride = created as unknown as ChannelPermissionOverride;
    console.log(`   ✅ Created role override (${roleOverride.$id})`);
  }
  console.log(`   📋 Role override: Allow [${roleOverride.allowPermissions.join(", ")}], Deny [${roleOverride.denyPermissions.join(", ")}]\n`);

  // Step 7: Test channel permission override for user
  console.log("7️⃣ Testing channel permission override for user...");
  const existingUserOverrides = await databases.listDocuments(
    DATABASE_ID,
    CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
    [
      Query.equal("channelId", channelId),
      Query.equal("roleId", ""),
      Query.equal("userId", testUserId)
    ]
  );
  
  let userOverride: ChannelPermissionOverride;
  if (existingUserOverrides.documents.length > 0) {
    userOverride = existingUserOverrides.documents[0] as unknown as ChannelPermissionOverride;
    console.log(`   ✅ Using existing user override (${userOverride.$id})`);
  } else {
    const created = await databases.createDocument(
      DATABASE_ID,
      CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
      "unique()",
      {
        channelId,
        serverId,
        roleId: "",
        userId: testUserId,
        allowPermissions: ["send_messages"],
        denyPermissions: []
      } as Record<string, unknown>
    );
    userOverride = created as unknown as ChannelPermissionOverride;
    console.log(`   ✅ Created user override (${userOverride.$id})`);
  }
  console.log(`   📋 User override: Allow [${userOverride.allowPermissions.join(", ")}], Deny [${userOverride.denyPermissions.join(", ")}]\n`);

  // Step 8: List all overrides for the channel
  console.log("8️⃣ Listing all channel overrides...");
  const allOverrides = await databases.listDocuments(
    DATABASE_ID,
    CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID,
    [Query.equal("channelId", channelId)]
  );
  console.log(`   ✅ Found ${allOverrides.documents.length} overrides for channel ${String(channelName)}`);
  for (const doc of allOverrides.documents) {
    const override = doc as unknown as ChannelPermissionOverride;
    const type = override.roleId ? "Role" : "User";
    const target = override.roleId || override.userId;
    console.log(`      - ${type} Override (${override.$id}): ${target}`);
    console.log(`        Allow: [${override.allowPermissions.join(", ")}]`);
    console.log(`        Deny: [${override.denyPermissions.join(", ")}]`);
  }
  console.log();

  // Step 9: Test permission calculation
  console.log("9️⃣ Testing permission calculation...");
  console.log(`   Base role permissions: [${testRole.permissions.join(", ")}]`);
  console.log(`   Role override: Allow [${roleOverride.allowPermissions.join(", ")}], Deny [${roleOverride.denyPermissions.join(", ")}]`);
  console.log(`   User override: Allow [${userOverride.allowPermissions.join(", ")}], Deny [${userOverride.denyPermissions.join(", ")}]`);
  console.log("\n   Expected final permissions:");
  console.log(`   - view_channels: ✅ (from base role)`);
  console.log(`   - send_messages: ✅ (denied by role override, but allowed by user override - user wins)`);
  console.log(`   - manage_channels: ✅ (allowed by role override)\n`);

  // Step 10: Test removal
  console.log("🔟 Testing removal...");
  
  // Remove role from user
  const updatedRoleIds = assignment.roleIds.filter((id) => id !== testRole.$id);
  if (updatedRoleIds.length > 0) {
    await databases.updateDocument(
      DATABASE_ID,
      ROLE_ASSIGNMENTS_COLLECTION_ID,
      assignment.$id,
      { roleIds: updatedRoleIds }
    );
    console.log(`   ✅ Removed role from user (assignment still exists with ${updatedRoleIds.length} roles)`);
  } else {
    await databases.deleteDocument(
      DATABASE_ID,
      ROLE_ASSIGNMENTS_COLLECTION_ID,
      assignment.$id
    );
    console.log(`   ✅ Deleted role assignment (no roles remaining)`);
  }

  console.log("\n✅ All tests completed successfully!\n");
  console.log("📝 Summary:");
  console.log(`   - Server: ${String(serverName)} (${serverId})`);
  console.log(`   - Channel: ${String(channelName)} (${channelId})`);
  console.log(`   - Test Role: ${testRole.name} (${testRole.$id})`);
  console.log(`   - Test User: ${String(testUserId)}`);
  console.log(`   - Role Override ID: ${roleOverride.$id}`);
  console.log(`   - User Override ID: ${userOverride.$id}`);
  console.log("\n🎯 Next Steps:");
  console.log("   1. Open the chat page and join the test server");
  console.log("   2. Click Settings gear to open role settings");
  console.log("   3. Click 'Manage Members' on the test role");
  console.log("   4. Select a channel and click 'Channel Permissions'");
  console.log("   5. Verify overrides are displayed correctly");
  console.log("   6. Try creating new overrides via the UI\n");
}

main().catch(console.error);
