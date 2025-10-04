# Appwrite Memberships Collection Setup Guide

Based on the Appwrite documentation, here's what needs to be configured:

## 1. Collection Settings

Navigate to your Appwrite Console → Database → Memberships Collection → Settings

### Required Attributes:

- `serverId` (string, required)
- `userId` (string, required)
- `role` (enum: ["owner", "member"], required)
- ~~`createdAt`~~ (REMOVE - using $createdAt instead)

### Enable Row Security:

✅ **CRITICAL:** Go to Settings → **Row Security** → Enable

This allows row-level permissions to work. Without this, only table-level permissions apply.

## 2. Table-Level Permissions

Go to Settings → **Permissions**

### For CREATE permission:

Add: **Role: users (authenticated)** with **CREATE** permission

This allows any authenticated user to create membership rows.

### For READ/UPDATE/DELETE:

**Leave empty** at table level. We handle these with row-level permissions.

## 3. Row-Level Permissions (Set via Code)

When creating a membership (either through `createServer` or `joinServer`), we set:

```typescript
[
  Permission.read(Role.any()), // Anyone can see memberships
  Permission.update(Role.user(userId)), // Only the user can update their membership
  Permission.delete(Role.user(userId)), // Only the user can delete their membership
];
```

## 4. Why This Works:

1. **Table-level CREATE** permission allows users to create memberships
2. **Row Security enabled** means row-level permissions are enforced
3. **Row-level read("any")** allows the server SDK (with API key) to query all memberships
4. **Row-level user-specific update/delete** prevents users from modifying others' memberships

## 5. API Endpoint Authentication

Our `/api/memberships` endpoint:

- Uses server SDK with API key (full access)
- Validates user session server-side
- Returns only memberships for the authenticated user
- Bypasses client SDK permission issues

## Verification Steps:

1. ✅ Check Row Security is enabled on memberships collection
2. ✅ Check table-level permissions allow CREATE for authenticated users
3. ✅ Test `/api/memberships` endpoint returns your memberships
4. ✅ Test joining a server creates a membership with correct permissions
5. ✅ Verify joined servers appear in sidebar after reload

## Common Issues:

### Issue: "User (role: guests) missing scopes"

**Solution:** Row Security might not be enabled, or table permissions are incorrect

### Issue: Memberships not loading

**Solution:** Check that `/api/memberships` endpoint is being called and authentication is working

### Issue: Can't create memberships

**Solution:** Table-level CREATE permission must be granted to authenticated users

## Testing the Setup:

```bash
# 1. Check if memberships endpoint works
curl -X GET http://localhost:3001/api/memberships \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Should return: { "memberships": [...] }

# 2. Join a server
curl -X POST http://localhost:3001/api/servers/join \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d '{"serverId": "SERVER_ID"}'

# Should return: { "success": true }

# 3. Check memberships again
curl -X GET http://localhost:3001/api/memberships \
  -H "Cookie: session=YOUR_SESSION_COOKIE"

# Should now include the new membership
```
