# Server SDK Integration Fix

## Problem

The `getServerClient()` function in `appwrite-core.ts` was trying to use the client SDK (`appwrite`) which doesn't support the `.setKey()` method needed for API key authentication.

## Error

```
TypeError: client.setKey is not a function
  at getServerClient (src/lib/appwrite-core.ts:189:58)
```

## Root Cause

- `appwrite-core.ts` was importing from `appwrite` (client SDK)
- Client SDK doesn't have `.setKey()` method (only server SDK has it)
- Server-side functions need `node-appwrite` (server SDK) for API key support

## Solution

Created a separate server-only module to properly import the server SDK:

### 1. Created `src/lib/appwrite-server.ts`

```typescript
import { Client, Databases, Teams } from "node-appwrite";

export function getServerClient() {
  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.project)
    .setKey(apiKey); // ✅ Works with server SDK

  return { client, databases, teams };
}
```

### 2. Updated `src/lib/appwrite-core.ts`

```typescript
// Re-export server client from separate module
export { getServerClient } from "./appwrite-server";
```

## Why This Works

### SDK Separation

- **Client SDK** (`appwrite`): Browser-safe, no API keys, used for client-side code
- **Server SDK** (`node-appwrite`): Supports API keys, used for server-side code

### File Structure

```
src/lib/
├── appwrite.ts           # Client-side SDK wrapper
├── appwrite-core.ts      # Shared utilities (uses client SDK)
├── appwrite-server.ts    # Server-only utilities (uses server SDK) ← NEW
├── auth-server.ts        # Server-side auth (uses server SDK)
└── appwrite-admin.ts     # Admin functions (uses server SDK via core)
```

### Import Rules

| File                 | SDK                      | Usage                      |
| -------------------- | ------------------------ | -------------------------- |
| `appwrite.ts`        | `appwrite`               | Client components, hooks   |
| `appwrite-core.ts`   | `appwrite`               | Browser utilities          |
| `appwrite-server.ts` | `node-appwrite`          | Server client with API key |
| `auth-server.ts`     | `node-appwrite`          | Server actions, API routes |
| `appwrite-admin.ts`  | Uses `getServerClient()` | Admin operations           |

## Files Updated

### ✅ Created

- `src/lib/appwrite-server.ts` - Server-only client with API key support

### ✅ Modified

- `src/lib/appwrite-core.ts` - Re-exports `getServerClient` from server module

### ✅ Already Using Server SDK

- `src/app/(auth)/login/actions.ts` - Login/register actions
- `src/lib/auth-server.ts` - Session validation
- `src/app/api/debug-cookies/route.ts` - Debug endpoint

## Testing

### Before (Broken)

```bash
curl http://localhost:3000/admin
# Error: client.setKey is not a function
```

### After (Working)

```bash
curl http://localhost:3000/admin
# Returns admin page (or redirects if not logged in)
```

## Key Takeaway

**Never mix client and server SDKs!**

- ✅ Use `appwrite` for browser/client code
- ✅ Use `node-appwrite` for server code with API keys
- ✅ Keep them in separate files to avoid bundling issues
- ✅ Re-export when needed for backward compatibility

## Related Fixes

This is part of the larger SSR authentication fix that included:

1. Installing `node-appwrite` server SDK
2. Updating login actions to use server SDK
3. Fixing session token storage (`.secret` vs `.$id`)
4. Separating client and server SDK usage ← **This fix**
