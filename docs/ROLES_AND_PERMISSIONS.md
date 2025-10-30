# Roles & Permissions System

> **Status:** ✅ Production Ready (Completed October 2025)

Complete guide to Firepit's role-based access control system.

## Overview

Firepit implements a comprehensive role and permission system that allows server owners to:

-   Create custom roles with specific permissions
-   Assign roles to members with hierarchy support
-   Override permissions per channel for roles and users
-   Manage server moderation with audit logging

## Architecture

### Database Collections

#### 1. **roles** Collection

Stores role definitions for each server.

```typescript
{
  $id: string;                  // Unique role ID
  serverId: string;             // Server this role belongs to
  name: string;                 // Role display name (max 100 chars)
  color: string;                // Hex color code (e.g., "#5865F2")
  position: number;             // Hierarchy position (0-999, higher = more power)

  // Permission flags (all boolean)
  readMessages: boolean;        // View channels and read history
  sendMessages: boolean;        // Send messages in channels
  manageMessages: boolean;      // Delete/edit others' messages
  manageChannels: boolean;      // Create/edit/delete channels
  manageRoles: boolean;         // Create/edit/delete roles
  manageServer: boolean;        // Change server settings
  mentionEveryone: boolean;     // Use @everyone/@here
  administrator: boolean;       // All permissions + bypass overrides

  // Display settings
  mentionable: boolean;         // Can be @mentioned
  memberCount?: number;         // Cached member count
}
```

**Indexes:**

-   `serverId_idx` - Query roles by server
-   `position_idx` - Order roles by hierarchy

#### 2. **role_assignments** Collection

Maps users to their roles in servers.

```typescript
{
  $id: string;
  userId: string;               // User being assigned
  serverId: string;             // Server context
  roleIds: string[];            // Array of role IDs user has
}
```

**Indexes:**

-   `userId_idx` - Find all servers where user has roles
-   `serverId_idx` - Find all role assignments in a server
-   `userId_serverId_idx` - Compound index for quick lookups

#### 3. **channel_permission_overrides** Collection

Per-channel permission overrides for roles or users.

```typescript
{
  $id: string;
  channelId: string;            // Channel to override
  roleId?: string;              // Role override (mutually exclusive with userId)
  userId?: string;              // User override (mutually exclusive with roleId)
  allow: Permission[];          // Permissions to explicitly allow
  deny: Permission[];           // Permissions to explicitly deny (takes precedence)
}
```

**Indexes:**

-   `channelId_idx` - All overrides for a channel
-   `roleId_idx` - All channels where role has overrides
-   `userId_idx` - All channels where user has overrides

### Permission Types

```typescript
type Permission =
    | "readMessages" // View channels and message history
    | "sendMessages" // Send messages
    | "manageMessages" // Delete/edit others' messages
    | "manageChannels" // Create/edit/delete channels
    | "manageRoles" // Create/edit/delete roles below own highest role
    | "manageServer" // Change server name and settings
    | "mentionEveryone" // Use @everyone and @here mentions
    | "administrator"; // Bypass all checks, grant all permissions
```

## Permission Hierarchy

Permissions are calculated in the following order (highest priority first):

1. **Server Owner** - Automatic all permissions
2. **Administrator Role** - Bypasses all checks, grants all permissions
3. **Channel User Override** - Specific user permissions in a channel
4. **Channel Role Override** - Role permissions in a channel
5. **Base Role Permissions** - Combined from all assigned roles (OR operation)
6. **Default Deny** - No permission unless explicitly granted

### Key Rules

-   **OR Operation for Roles:** If any role grants a permission, user has it
-   **Deny Takes Precedence:** Channel overrides can deny permissions even if role grants them
-   **User Overrides Win:** User-specific overrides beat role overrides
-   **Hierarchy for Management:** Can only manage roles lower in position than your highest role
-   **Admin Bypass:** Administrator role ignores all channel overrides

## API Endpoints

### Roles Management

#### `GET /api/roles?serverId={serverId}`

List all roles for a server, ordered by position (descending).

**Response:**

```json
{
    "roles": [
        {
            "$id": "role123",
            "serverId": "server456",
            "name": "Admin",
            "color": "#FF5733",
            "position": 10,
            "readMessages": true,
            "sendMessages": true,
            "manageMessages": true,
            "manageChannels": true,
            "manageRoles": true,
            "manageServer": true,
            "mentionEveryone": true,
            "administrator": false,
            "mentionable": true,
            "memberCount": 3
        }
    ]
}
```

#### `POST /api/roles`

Create a new role.

**Request Body:**

```json
{
    "serverId": "server456",
    "name": "Moderator",
    "color": "#5865F2",
    "position": 5,
    "readMessages": true,
    "sendMessages": true,
    "manageMessages": true,
    "manageChannels": false,
    "manageRoles": false,
    "manageServer": false,
    "mentionEveryone": false,
    "administrator": false,
    "mentionable": true
}
```

#### `PUT /api/roles`

Update an existing role.

**Request Body:** (include `$id` and only fields to update)

```json
{
    "$id": "role123",
    "name": "Senior Moderator",
    "position": 6,
    "manageChannels": true
}
```

#### `DELETE /api/roles?roleId={roleId}`

Delete a role. Also removes all role assignments.

### Role Assignments

#### `GET /api/role-assignments?serverId={serverId}&roleId={roleId}`

Get all members with a specific role (includes profile data).

**Response:**

```json
{
    "members": [
        {
            "userId": "user789",
            "displayName": "John Doe",
            "userName": "johndoe",
            "avatarUrl": "https://...",
            "roleIds": ["role123", "role456"]
        }
    ]
}
```

#### `GET /api/role-assignments?serverId={serverId}&userId={userId}`

Get all roles for a specific user in a server.

#### `POST /api/role-assignments`

Assign a role to a user.

**Request Body:**

```json
{
    "userId": "user789",
    "serverId": "server456",
    "roleId": "role123"
}
```

#### `DELETE /api/role-assignments?userId={userId}&serverId={serverId}&roleId={roleId}`

Remove a role from a user.

### Channel Permission Overrides

#### `GET /api/channel-permissions?channelId={channelId}`

List all permission overrides for a channel.

#### `POST /api/channel-permissions`

Create a permission override.

**Request Body (Role Override):**

```json
{
    "channelId": "channel789",
    "roleId": "role123",
    "allow": ["readMessages", "sendMessages"],
    "deny": ["manageMessages"]
}
```

**Request Body (User Override):**

```json
{
    "channelId": "channel789",
    "userId": "user456",
    "allow": ["readMessages", "sendMessages", "manageMessages"],
    "deny": []
}
```

#### `PUT /api/channel-permissions`

Update an override's allow/deny lists.

#### `DELETE /api/channel-permissions?overrideId={overrideId}`

Remove a permission override.

## Permission Calculation

### Client-Side Calculation

Use the `lib/permissions.ts` utilities:

```typescript
import { getEffectivePermissions, hasPermission } from '@/lib/permissions';

// Get user's roles and channel overrides
const userRoles = [...]; // Role[]
const channelOverrides = [...]; // ChannelPermissionOverride[]
const isOwner = server.ownerId === userId;

// Calculate effective permissions
const permissions = getEffectivePermissions(
  userRoles,
  channelOverrides,
  isOwner
);

// Check specific permission
if (hasPermission('sendMessages', permissions)) {
  // User can send messages
}

// Check if user can manage a role
import { canManageRole } from '@/lib/permissions';
if (canManageRole(userRoles, targetRole, isOwner)) {
  // User can edit/delete this role
}
```

### Utility Functions

```typescript
// Calculate role hierarchy (highest position first)
const sortedRoles = calculateRoleHierarchy(roles);

// Get user's highest role
const highestRole = getHighestRole(userRoles);

// Get all available permissions
const allPerms = getAllPermissions();
// Returns: ["readMessages", "sendMessages", ...]

// Get permission description
const desc = getPermissionDescription("manageMessages");
// Returns: "Delete and edit messages from other users"

// Validate permission name
if (isValidPermission(permString)) {
    // Valid permission
}
```

## UI Components

### Role Management

#### `RoleSettingsDialog`

Main modal for server owners to manage roles.

**Props:**

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
  isOwner: boolean;
}
```

**Features:**

-   Lists all roles with hierarchy
-   Create new roles
-   Edit existing roles
-   Delete roles (with confirmation)
-   Manage role members

#### `RoleEditor`

Create/edit role form with permissions.

**Props:**

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;  // null = create new
  serverId: string;
  onSave: (role: Partial<Role>) => Promise<void>;
}
```

**Features:**

-   Role name input
-   Color picker
-   Position slider
-   Mentionable toggle
-   All 8 permission toggles with descriptions

#### `RoleList`

Display roles with hierarchy and actions.

**Props:**

```typescript
{
  roles: Role[];
  serverId: string;
  isOwner: boolean;
  onEditRole: (role: Role) => void;
  onCreateRole: () => void;
  onDeleteRole: (roleId: string) => void;
  onManageMembers: (role: Role) => void;
}
```

#### `RoleMemberList`

Manage which members have a specific role.

**Props:**

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  serverId: string;
}
```

**Features:**

-   Search members with role
-   Add members to role
-   Remove members from role
-   Profile avatars and names

#### `ChannelPermissionsEditor`

Manage channel-specific permission overrides.

**Props:**

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName: string;
  serverId: string;
}
```

**Features:**

-   List all overrides (role and user)
-   Create new override (role or user)
-   Allow/deny permission toggles
-   Delete overrides

### Integration

In your chat page:

```tsx
import { RoleSettingsDialog } from "@/components/role-settings-dialog";
import { ChannelPermissionsEditor } from "@/components/channel-permissions-editor";

// Server settings button (gear icon)
{
    isOwner && (
        <Button onClick={() => setRoleSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
        </Button>
    );
}

<RoleSettingsDialog
    open={roleSettingsOpen}
    onOpenChange={setRoleSettingsOpen}
    serverId={selectedServer}
    serverName={serverName}
    isOwner={isOwner}
/>;

// Channel permissions button
{
    isOwner && (
        <Button onClick={() => setChannelPermissionsOpen(true)}>
            <Shield className="h-4 w-4" />
            Channel Permissions
        </Button>
    );
}

<ChannelPermissionsEditor
    open={channelPermissionsOpen}
    onOpenChange={setChannelPermissionsOpen}
    channelId={selectedChannel}
    channelName={channelName}
    serverId={selectedServer}
/>;
```

## Best Practices

### Role Design

1. **Start Simple:** Create basic roles first (Member, Moderator, Admin)
2. **Use Hierarchy:** Higher position = more permissions
3. **Color Code:** Use distinct colors for easy identification
4. **Name Clearly:** Use descriptive names (avoid abbreviations)
5. **Default Deny:** Grant minimum permissions needed

### Permission Strategy

1. **Administrator Role:** Reserve for trusted users only
2. **Channel Overrides:** Use sparingly for private channels
3. **User Overrides:** Prefer role-based permissions over user-specific
4. **Regular Review:** Audit roles and assignments periodically

### Security

1. **Owner Protection:** Only server owner can delete server
2. **Hierarchy Enforcement:** Can't manage higher-positioned roles
3. **Audit Logging:** All moderation actions are logged
4. **Permission Validation:** API validates all permission changes

## Common Use Cases

### Creating a Moderator Role

```typescript
// Create role via API
const moderatorRole = {
    serverId: "server123",
    name: "Moderator",
    color: "#3498DB",
    position: 5,
    readMessages: true,
    sendMessages: true,
    manageMessages: true, // Can delete/edit messages
    manageChannels: false,
    manageRoles: false,
    manageServer: false,
    mentionEveryone: false,
    administrator: false,
    mentionable: true,
};
```

### Private Channel for Admins

```typescript
// Create channel override to deny everyone except admin role
const override = {
    channelId: "channel-admin-only",
    roleId: "@everyone-role-id",
    allow: [],
    deny: ["readMessages", "sendMessages"], // Block default role
};

// Admin role automatically has access via base permissions
```

### Temporary User Access

```typescript
// Grant specific user access to a private channel
const userOverride = {
    channelId: "channel-private",
    userId: "user789",
    allow: ["readMessages", "sendMessages"],
    deny: [],
};
```

## Troubleshooting

### User Can't See Channel

1. Check role permissions: `readMessages` must be true on at least one role
2. Check channel overrides: No deny overrides for user or roles
3. Verify role assignments: User actually has roles in the server

### Can't Manage Role

1. Check user's highest role position > target role position
2. Verify `manageRoles` permission
3. Owner can always manage all roles

### Permission Override Not Working

1. User overrides take precedence over role overrides
2. Deny always wins over allow
3. Administrator role bypasses all channel overrides

## Migration Guide

### From No Roles to Roles System

1. **Create @everyone role** for all existing servers
2. **Assign to all members** in each server
3. **Migrate admin permissions** to new admin role
4. **Set default permissions** (read + send messages)

### Updating Existing Servers

Script to create default roles:

```typescript
// scripts/migrate-to-roles.ts
import { databases } from "./appwrite-setup";

async function migrateServer(serverId: string) {
    // Create @everyone role
    const everyoneRole = await databases.createDocument(
        "main",
        "roles",
        ID.unique(),
        {
            serverId,
            name: "@everyone",
            color: "#99AAB5",
            position: 0,
            readMessages: true,
            sendMessages: true,
            manageMessages: false,
            manageChannels: false,
            manageRoles: false,
            manageServer: false,
            mentionEveryone: false,
            administrator: false,
            mentionable: false,
        }
    );

    // Assign to all members
    const members = await databases.listDocuments("main", "memberships", [
        Query.equal("serverId", serverId),
    ]);

    for (const member of members.documents) {
        await databases.createDocument(
            "main",
            "role_assignments",
            ID.unique(),
            {
                userId: member.userId,
                serverId,
                roleIds: [everyoneRole.$id],
            }
        );
    }
}
```

## Future Enhancements

-   [ ] Role mentions in messages (@role)
-   [ ] Automatic @everyone role creation
-   [ ] Role templates/presets
-   [ ] Drag-and-drop role reordering
-   [ ] Role change audit logging
-   [ ] Permission comparison tool
-   [ ] Role sync across channels
-   [ ] Temporary role assignments
-   [ ] Role emojis/icons

## References

-   [ROADMAP.md](../ROADMAP.md) - Feature roadmap
-   [types.ts](../src/lib/types.ts) - TypeScript definitions
-   [permissions.ts](../src/lib/permissions.ts) - Permission utilities
-   API Routes:
    -   [/api/roles/route.ts](../src/app/api/roles/route.ts)
    -   [/api/role-assignments/route.ts](../src/app/api/role-assignments/route.ts)
    -   [/api/channel-permissions/route.ts](../src/app/api/channel-permissions/route.ts)

---

**Last Updated:** October 30, 2025  
**Status:** Production Ready ✅
