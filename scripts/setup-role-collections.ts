#!/usr/bin/env bun
/**
 * Add role permissions collections to Appwrite database
 * 
 * Creates three collections:
 * 1. roles - Role definitions with permissions
 * 2. role_assignments - User-role mappings
 * 3. channel_permission_overrides - Channel-specific permission overrides
 */

import { ID, IndexType, Permission } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";

const { databases } = getAdminClient();

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;

async function main() {
  console.log("🔧 Setting up role permissions collections\n");

  // Create roles collection
  console.log("1️⃣ Creating 'roles' collection...");
  try {
    const rolesCollection = await databases.createCollection(
      DATABASE_ID,
      ID.unique(),
      "roles",
      [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
      ]
    );
    
    console.log(`   ✅ Created collection: ${rolesCollection.$id}`);
    console.log(`      Add to .env.local: APPWRITE_ROLES_COLLECTION_ID="${rolesCollection.$id}"`);

    // Add attributes
    await databases.createStringAttribute(DATABASE_ID, rolesCollection.$id, "serverId", 36, true);
    await databases.createStringAttribute(DATABASE_ID, rolesCollection.$id, "name", 100, true);
    await databases.createStringAttribute(DATABASE_ID, rolesCollection.$id, "color", 7, true);
    await databases.createIntegerAttribute(DATABASE_ID, rolesCollection.$id, "position", true);
    await databases.createStringAttribute(DATABASE_ID, rolesCollection.$id, "permissions", 5000, true, undefined, true);
    
    console.log("   ✅ Added attributes");

    // Add indexes
    await databases.createIndex(DATABASE_ID, rolesCollection.$id, "serverId_idx", IndexType.Key, ["serverId"], ["asc"]);
    await databases.createIndex(DATABASE_ID, rolesCollection.$id, "position_idx", IndexType.Key, ["position"], ["asc"]);
    
    console.log("   ✅ Added indexes\n");
  } catch (error) {
    if ((error as { code: number }).code === 409) {
      console.log("   ⚠️  Collection 'roles' already exists\n");
    } else {
      throw error;
    }
  }

  // Create role_assignments collection
  console.log("2️⃣ Creating 'role_assignments' collection...");
  try {
    const assignmentsCollection = await databases.createCollection(
      DATABASE_ID,
      ID.unique(),
      "role_assignments",
      [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
      ]
    );
    
    console.log(`   ✅ Created collection: ${assignmentsCollection.$id}`);
    console.log(`      Add to .env.local: APPWRITE_ROLE_ASSIGNMENTS_COLLECTION_ID="${assignmentsCollection.$id}"`);

    // Add attributes
    await databases.createStringAttribute(DATABASE_ID, assignmentsCollection.$id, "serverId", 36, true);
    await databases.createStringAttribute(DATABASE_ID, assignmentsCollection.$id, "userId", 36, true);
    await databases.createStringAttribute(DATABASE_ID, assignmentsCollection.$id, "roleIds", 5000, true, undefined, true);
    
    console.log("   ✅ Added attributes");

    // Add indexes
    await databases.createIndex(DATABASE_ID, assignmentsCollection.$id, "serverId_userId_idx", IndexType.Unique, ["serverId", "userId"], ["asc", "asc"]);
    await databases.createIndex(DATABASE_ID, assignmentsCollection.$id, "serverId_idx", IndexType.Key, ["serverId"], ["asc"]);
    await databases.createIndex(DATABASE_ID, assignmentsCollection.$id, "userId_idx", IndexType.Key, ["userId"], ["asc"]);
    
    console.log("   ✅ Added indexes\n");
  } catch (error) {
    if ((error as { code: number }).code === 409) {
      console.log("   ⚠️  Collection 'role_assignments' already exists\n");
    } else {
      throw error;
    }
  }

  // Create channel_permission_overrides collection
  console.log("3️⃣ Creating 'channel_permission_overrides' collection...");
  try {
    const overridesCollection = await databases.createCollection(
      DATABASE_ID,
      ID.unique(),
      "channel_permission_overrides",
      [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
      ]
    );
    
    console.log(`   ✅ Created collection: ${overridesCollection.$id}`);
    console.log(`      Add to .env.local: APPWRITE_CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID="${overridesCollection.$id}"`);

    // Add attributes
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "channelId", 36, true);
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "serverId", 36, true);
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "roleId", 36, false);
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "userId", 36, false);
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "allowPermissions", 5000, true, undefined, true);
    await databases.createStringAttribute(DATABASE_ID, overridesCollection.$id, "denyPermissions", 5000, true, undefined, true);
    
    console.log("   ✅ Added attributes");

    // Add indexes
    await databases.createIndex(DATABASE_ID, overridesCollection.$id, "channelId_idx", IndexType.Key, ["channelId"], ["asc"]);
    await databases.createIndex(DATABASE_ID, overridesCollection.$id, "channelId_roleId_idx", IndexType.Key, ["channelId", "roleId"], ["asc", "asc"]);
    await databases.createIndex(DATABASE_ID, overridesCollection.$id, "channelId_userId_idx", IndexType.Key, ["channelId", "userId"], ["asc", "asc"]);
    
    console.log("   ✅ Added indexes\n");
  } catch (error) {
    if ((error as { code: number }).code === 409) {
      console.log("   ⚠️  Collection 'channel_permission_overrides' already exists\n");
    } else {
      throw error;
    }
  }

  console.log("✅ Setup complete!\n");
  console.log("📝 Next steps:");
  console.log("   1. Add the collection IDs shown above to your .env.local file");
  console.log("   2. Restart your development server");
  console.log("   3. Run the test script: bun run scripts/test-role-members-and-permissions.ts\n");
}

main().catch(console.error);
