# Created At Attribute Fix

## Issue

When attempting to create servers, channels, messages, audit logs, and memberships, got error:

```
{"success":false,"error":"Invalid document structure: Unknown attribute: \"createdAt\""}
```

## Root Cause

The Appwrite setup script was defining custom `createdAt` attributes for several collections (messages, audit, memberships), but the application code never set these values when creating documents. This created:

1. **Schema mismatch**: Custom `createdAt` attributes defined but never populated
2. **Confusion**: Mix of custom `createdAt` and system `$createdAt` usage
3. **Wasted resources**: Unused attributes and indices taking up schema space
4. **Potential errors**: If code tried to set `createdAt` on collections without the attribute

The application code correctly uses Appwrite's built-in `$createdAt` field, which is automatically set for all documents.

## Solution

### Phase 1: Remove Custom Attributes from Code (Already Done)

Ensured document creation never tries to set custom `createdAt`:

```typescript
// ✅ Correct - Let Appwrite set $createdAt automatically
const serverDoc = await databases.createDocument(
  DATABASE_ID,
  SERVERS_COLLECTION_ID,
  ID.unique(),
  { name: name.trim(), ownerId }, // Only schema-defined attributes
  permissions
);
```

### Phase 2: Remove Custom Attributes from Schema (This Fix)

Updated `scripts/setup-appwrite.ts` to remove unused custom `createdAt` attributes:

**Messages Collection**:
- ❌ Removed: `["createdAt", LEN_TS, true]` attribute
- ❌ Removed: `idx_created_desc` index on `createdAt`
- ❌ Removed: Compound indices using `createdAt` (channel_created, server_created, user_created)
- ✅ Uses: System `$createdAt` for ordering

**Audit Collection**:
- ❌ Removed: `["createdAt", LEN_TS, true]` attribute
- ❌ Removed: `idx_created_desc` index on `createdAt`
- ✅ Uses: System `$createdAt` for ordering

**Memberships Collection**:
- ❌ Removed: `["createdAt", LEN_TS, true]` attribute
- ✅ Uses: System `$createdAt` when needed

**Servers & Channels Collections**:
- ✅ Already correct: Never had custom `createdAt` attributes
- ✅ Uses: System `$createdAt` for ordering

## Changes Made

### `scripts/setup-appwrite.ts`:
- `setupMessages()`: Removed custom `createdAt` attribute and related indices
- `setupAudit()`: Removed custom `createdAt` attribute and related indices  
- `setupMemberships()`: Removed custom `createdAt` attribute
- Added comments clarifying use of system `$createdAt`

### `src/app/admin/server-actions.ts` (Already Fixed):
- `createServerAction`: Doesn't set `createdAt` on server documents
- `createServerAction`: Doesn't set `joinedAt` on membership documents
- `createChannelAction`: Doesn't set `createdAt` on channel documents
- List functions use `doc.createdAt || doc.$createdAt` fallback for compatibility

## Result

- ✅ All collections use Appwrite's built-in `$createdAt` consistently
- ✅ No wasted schema space on unused custom attributes
- ✅ No confusion between `createdAt` and `$createdAt`
- ✅ No errors when creating documents
- ✅ All 262 tests passing

## Migration Note

For existing deployments with the old schema:
1. The custom `createdAt` attributes will remain in the database (Appwrite doesn't auto-delete)
2. They will simply be unused and empty
3. To clean up, manually delete these attributes via Appwrite Console if desired
4. New deployments will not have these attributes at all

## Testing

✅ All document creation now works without errors
✅ All timestamps use `$createdAt` consistently
✅ 262 automated tests passing
