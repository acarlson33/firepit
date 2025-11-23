# Server Invite System

Complete implementation of the server invite system, allowing server owners and admins to create shareable invite links for their servers.

## Features

-   ✅ Unique invite codes (10-character nanoid)
-   ✅ Expiration options (1h, 6h, 12h, 1d, 7d, never)
-   ✅ Usage limits (unlimited, 1, 5, 10, 25, 50, 100)
-   ✅ Temporary membership option
-   ✅ Usage tracking and statistics
-   ✅ Public invite landing pages
-   ✅ Auto-join from query parameters
-   ✅ Copy invite links to clipboard
-   ✅ Revoke invites
-   ✅ View invite usage history

## Architecture

### Database Schema

#### `invites` Collection

-   `$id`: Unique document ID
-   `serverId`: Server the invite belongs to (indexed)
-   `code`: Unique 10-character invite code (unique index)
-   `creatorId`: User who created the invite (indexed)
-   `channelId`: Optional default channel to direct users to
-   `expiresAt`: ISO timestamp for expiration (optional)
-   `maxUses`: Maximum number of uses (null = unlimited)
-   `currentUses`: Current number of times used
-   `temporary`: Boolean - grant temporary membership
-   `$createdAt`: Creation timestamp

#### `invite_usage` Collection

-   `$id`: Unique document ID
-   `inviteCode`: The invite code used (indexed)
-   `userId`: User who joined (indexed)
-   `serverId`: Server joined (indexed)
-   `joinedAt`: ISO timestamp of join

### Type Definitions

```typescript
export type ServerInvite = {
    $id: string;
    serverId: string;
    code: string;
    creatorId: string;
    channelId?: string;
    expiresAt?: string;
    maxUses?: number;
    currentUses: number;
    temporary: boolean;
    $createdAt: string;
};

export type InviteUsage = {
    $id: string;
    inviteCode: string;
    userId: string;
    serverId: string;
    joinedAt: string;
};
```

### Core Utilities (`src/lib/appwrite-invites.ts`)

#### `generateUniqueCode(): Promise<string>`

Generates a unique 10-character invite code using nanoid with collision retry logic (up to 5 attempts).

#### `createInvite(options): Promise<ServerInvite>`

Creates a new invite with the specified options:

```typescript
{
  serverId: string;
  creatorId: string;
  channelId?: string;
  expiresAt?: string;
  maxUses?: number;
  temporary?: boolean;
}
```

#### `getInviteByCode(code: string): Promise<ServerInvite | null>`

Retrieves an invite by its code.

#### `validateInvite(code: string): Promise<ValidationResult>`

Validates an invite, checking:

-   Invite exists
-   Not expired
-   Max uses not exceeded

Returns:

```typescript
{
  valid: boolean;
  error?: string;
}
```

#### `useInvite(code: string, userId: string): Promise<UseInviteResult>`

Complete join flow:

1. Validates invite
2. Checks user not already member
3. Creates membership
4. Increments usage count
5. Records usage in invite_usage
6. Updates server member count

Returns:

```typescript
{
  success: boolean;
  serverId?: string;
  error?: string;
}
```

#### `listServerInvites(serverId: string): Promise<ServerInvite[]>`

Lists all invites for a server (limit 100, ordered by creation date descending).

#### `revokeInvite(inviteId: string): Promise<boolean>`

Deletes an invite document.

#### `getInviteUsage(code: string): Promise<InviteUsage[]>`

Gets all usage records for an invite (limit 100).

#### `getServerPreview(serverId: string): Promise<ServerPreview | null>`

Public endpoint to get server name and member count for invite landing page.

Returns:

```typescript
{
    name: string;
    memberCount: number;
}
```

## API Endpoints

### `POST /api/servers/[serverId]/invites`

Create a new invite for a server.

**Auth**: Required (server owner or global admin)

**Request Body**:

```json
{
    "channelId": "optional_channel_id",
    "expiresAt": "2024-12-31T23:59:59.999Z",
    "maxUses": 10,
    "temporary": false
}
```

**Response**: `ServerInvite` object

### `GET /api/servers/[serverId]/invites`

List all invites for a server.

**Auth**: Required (server owner or global admin)

**Response**: Array of `ServerInvite` objects

### `GET /api/invites/[code]`

Get invite preview (public endpoint).

**Auth**: Not required

**Response**:

```json
{
    "invite": {
        "code": "abc123xyz7",
        "serverId": "server_id",
        "expiresAt": "2024-12-31T23:59:59.999Z",
        "maxUses": 10,
        "currentUses": 5,
        "temporary": false
    },
    "server": {
        "name": "My Server",
        "memberCount": 42
    }
}
```

### `DELETE /api/invites/[code]`

Revoke an invite.

**Auth**: Required (server owner, invite creator, or global admin)

**Response**:

```json
{
    "success": true
}
```

### `POST /api/invites/[code]/join`

Join a server via invite code.

**Auth**: Required

**Response**:

```json
{
    "success": true,
    "serverId": "server_id"
}
```

## UI Components

### `InviteManagerDialog`

Dialog for managing server invites.

**Features**:

-   List all invites with usage stats
-   Show expiration dates and status (expired, maxed out)
-   Copy invite links
-   Delete/revoke invites
-   Create new invites

**Props**:

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  onCreateInvite: () => void;
}
```

### `CreateInviteDialog`

Dialog for creating new invites.

**Features**:

-   Expiration dropdown (never/1h/6h/12h/1d/7d)
-   Max uses selector (unlimited/1/5/10/25/50/100)
-   Temporary membership checkbox
-   Generate and copy invite link

**Props**:

```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  onInviteCreated: () => void;
}
```

## Public Invite Pages

### `/invite/[code]`

Public landing page for invite links.

**Features**:

-   Server preview (name, member count)
-   Invite code display
-   Join button (or login prompt if not authenticated)
-   Auto-join support via `?auto=true` query param
-   Handles expired/invalid invites

**Server-rendered** with proper metadata for SEO.

## Auto-Join Flow

The chat page (`/app/chat/page.tsx`) detects the `?invite=code` query parameter and automatically:

1. Checks if user is authenticated
2. Calls `/api/invites/[code]/join`
3. Shows success/error toast
4. Clears the query parameter
5. Uses sessionStorage to prevent duplicate joins

**Usage**:

```
/chat?invite=abc123xyz7
```

## Permissions

### Create Invites

-   Server owner
-   Global admin

### Revoke Invites

-   Server owner
-   Invite creator
-   Global admin

### Use Invites

-   Any authenticated user (not already a member)

## Error Handling

All endpoints and utilities include comprehensive error handling:

-   Validation errors (expired, max uses reached)
-   Authentication errors
-   Permission errors
-   Not found errors
-   Server errors

Non-critical operations (usage tracking, member count updates) fail gracefully without blocking the join flow.

## Security Considerations

-   ✅ Unique codes prevent guessing
-   ✅ Expiration limits exposure
-   ✅ Max uses prevent abuse
-   ✅ Usage tracking for audit trails
-   ✅ Permission checks on all mutating operations
-   ✅ Server preview is public (name and member count only)
-   ✅ Temporary membership option for trial access

## Future Enhancements

-   Rate limiting on invite creation
-   Cleanup job for expired invites
-   Vanity codes for premium servers
-   Invite analytics dashboard
-   Email invite delivery
-   Multi-use temporary invites
-   Invite templates

## Testing

Tests are pending implementation. Recommended coverage:

### Unit Tests

-   `generateUniqueCode()` collision handling
-   `validateInvite()` expiration logic
-   `validateInvite()` max uses logic
-   `useInvite()` membership creation
-   All API endpoint handlers

### Integration Tests

-   Full invite flow: create → share → join
-   Expired invite rejection
-   Max uses enforcement
-   Permission checks
-   Usage tracking
-   Auto-join from query params

## Migration

To set up the invite system in an existing Appwrite database:

```bash
# Run the setup script
bun run scripts/setup-appwrite.ts
```

This will:

1. Create `invites` collection with proper indexes
2. Create `invite_usage` collection with proper indexes
3. Set up all required attributes and indexes

## Usage Examples

### Creating an Invite (Client-Side)

```typescript
const response = await fetch(`/api/servers/${serverId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        maxUses: 10,
        temporary: false,
    }),
});

const invite = await response.json();
const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
```

### Joining via Invite (Direct)

```typescript
const response = await fetch(`/api/invites/${code}/join`, {
    method: "POST",
});

if (response.ok) {
    const { serverId } = await response.json();
    router.push(`/chat?server=${serverId}`);
}
```

### Sharing an Invite Link

```
https://yoursite.com/invite/abc123xyz7
```

Or with auto-join on chat page:

```
https://yoursite.com/chat?invite=abc123xyz7
```

## Monitoring

All invite operations are logged via New Relic:

-   Invite creation (with duration)
-   Invite preview fetches
-   Join attempts (success/failure)
-   Revoke operations

Use New Relic dashboards to monitor:

-   Invite creation rate
-   Join success rate
-   Popular servers by invite usage
-   Expired invite cleanup needs
