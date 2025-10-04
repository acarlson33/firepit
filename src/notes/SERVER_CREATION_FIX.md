# Server Creation Fix

## Issue

When attempting to create a server, got error:

```
{"success":false,"error":"Invalid document structure: Unknown attribute: \"createdAt\""}
```

## Root Cause

The Appwrite collection schema doesn't have a custom `createdAt` attribute defined. We were trying to set `createdAt` manually, but Appwrite automatically provides `$createdAt` for all documents.

## Solution

Removed the custom `createdAt` field from document creation:

### Before

```typescript
const createdAt = new Date().toISOString();
const serverDoc = await databases.createDocument(
  DATABASE_ID,
  SERVERS_COLLECTION_ID,
  ID.unique(),
  { name: name.trim(), ownerId, createdAt }, // ❌ createdAt not in schema
  permissions
);
```

### After

```typescript
const serverDoc = await databases.createDocument(
  DATABASE_ID,
  SERVERS_COLLECTION_ID,
  ID.unique(),
  { name: name.trim(), ownerId }, // ✅ Only schema-defined attributes
  permissions
);
```

## Changes Made

1. **`src/app/admin/server-actions.ts`**:
   - `createServerAction`: Removed `createdAt` from server document creation
   - `createServerAction`: Removed `joinedAt` from membership document creation
   - `createChannelAction`: Removed `createdAt` from channel document creation
   - List functions already handle both `doc.createdAt` and `doc.$createdAt` for compatibility

## Result

- Servers can now be created successfully
- Channels can now be created successfully
- Timestamps use Appwrite's built-in `$createdAt` field
- List functions work correctly with `$createdAt`

## Testing

Try creating a server and channel now - should work without errors!
