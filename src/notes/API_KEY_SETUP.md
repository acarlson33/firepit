# API Key Permissions for SSR Authentication

## Required Scopes

Your API key needs these scopes in Appwrite Console:

### For Authentication (Required)

- ✅ **sessions.write** - Create, update, and delete sessions

### For User Management (Optional, if using registration)

- ✅ **users.write** - Create new users during registration

## How to Fix

### 1. Go to Appwrite Console

Visit: https://cloud.appwrite.io/console/project-68b230a0002245833242/settings/keys

### 2. Create New API Key (or edit existing)

1. Click "Create API Key"
2. Name it: "SSR Authentication"
3. **Expiration**: Set to "Never" or far future date
4. **Scopes**: Check these boxes:
   - Under "Sessions" → Check **"sessions.write"**
   - Under "Users" → Check **"users.write"** (if you want registration to work)

### 3. Copy the API Key

After creating, copy the full API key value.

### 4. Update .env file

```bash
APPWRITE_API_KEY=your_new_api_key_here
```

### 5. Restart Dev Server

```bash
# Stop current server (Ctrl+C)
bun run dev
```

## Common Errors

### "Missing scope (sessions.write)"

❌ API key doesn't have `sessions.write` scope
✅ Add the scope in Appwrite Console

### "Invalid API key"

❌ API key is wrong, expired, or deleted
✅ Create a new one

### "Server API key missing"

❌ `APPWRITE_API_KEY` not in .env
✅ Add it to .env file

## Security Notes

### Why API Keys are Safe for SSR

1. **Server-side only**: API keys never leave your server
2. **Environment variables**: Stored in `.env`, never in client code
3. **Next.js protection**: Environment variables without `NEXT_PUBLIC_` prefix are server-only
4. **Recommended by Appwrite**: This is the official SSR authentication pattern

### Password Security

**Passwords are NOT transmitted in plain text!**

- ✅ Sent via Next.js Server Actions (POST request body)
- ✅ Encrypted by HTTPS in production
- ✅ Never logged or exposed to client
- ✅ Never in URLs or query parameters
- ✅ Follows Next.js and Appwrite best practices

The password flow:

1. User types password → masked in browser (`type="password"`)
2. Form submitted → Server Action called (encrypted POST)
3. Server receives password → Creates session with Appwrite
4. Session token returned → Stored in httpOnly cookie
5. Password discarded → Never stored anywhere

This is **exactly** how authentication should work.

## Testing

After updating the API key:

```bash
# 1. Restart server
bun run dev

# 2. Try logging in
# Visit: http://localhost:3000/login

# 3. Check for errors in browser console
# Should see success message or specific error
```

## Alternative: Check Current API Key Scopes

You can check your current API key in Appwrite Console:

1. Go to Settings → API Keys
2. Find your current key
3. Click to view details
4. Check the "Scopes" section

If it's missing `sessions.write`, either:

- Edit the key and add the scope, OR
- Create a new key with the right scopes
