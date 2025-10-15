# SSR Authentication Fix - RESOLVED

## The Root Cause

The authentication was failing with the error:

```
User (role: guests) missing scopes (["account"])
```

This happened because we were using the **wrong SDK and wrong session property**.

## The Issues

### Issue 1: Using Client SDK instead of Server SDK

- ❌ **Was using**: `appwrite` (client SDK)
- ✅ **Should use**: `node-appwrite` (server SDK)

The client SDK (`appwrite`) **cannot** create proper SSR sessions because it doesn't support API keys and doesn't return `session.secret`.

### Issue 2: Using `session.$id` instead of `session.secret`

- ❌ **Was setting cookie to**: `session.$id`
- ✅ **Should set cookie to**: `session.secret`

According to [Appwrite SSR documentation](https://appwrite.io/docs/products/auth/server-side-rendering#creating-sessions):

> Use the `secret` property of the session object as the cookie value.

The `secret` property is **only returned when using an admin client with an API key**.

## The Solution

### 1. Install Server SDK

```bash
bun add node-appwrite
```

### 2. Update Imports

Changed from:

```typescript
import { Account, Client } from "appwrite";
```

To:

```typescript
import { Account, Client } from "node-appwrite";
```

Files updated:

- `src/app/(auth)/login/actions.ts`
- `src/lib/auth-server.ts`
- `src/app/api/debug-cookies/route.ts`

### 3. Use Admin Client with API Key

```typescript
const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project)
  .setKey(apiKey); // THIS is required!
```

### 4. Store `session.secret` in Cookie

```typescript
const session = await account.createEmailPasswordSession({ email, password });

// Use session.secret (not session.$id!)
cookieStore.set(`a_session_${project}`, session.secret, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
});
```

## Environment Requirements

Make sure your `.env` file has:

```bash
# Required for SSR authentication
APPWRITE_API_KEY=your_api_key_here

# Also required
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
```

## How SSR Auth Works (Appwrite)

1. **User submits login** → Server action receives credentials
2. **Server creates admin client** → Uses API key (node-appwrite)
3. **Call createEmailPasswordSession** → Returns session with `secret` property
4. **Store `session.secret` in cookie** → Named `a_session_<PROJECT_ID>`
5. **Browser sends cookie with requests** → Included automatically
6. **Server validates session** → Uses `.setSession(cookieValue)` to auth Appwrite client
7. **Make authenticated requests** → User is now authenticated

## Testing

1. **Login** at `http://localhost:3000/login`

2. **Check debug endpoint**:

   ```bash
   curl -s http://localhost:3000/api/debug-cookies
   ```

   Should show:

   - `sessionCookieExists: true`
   - `validation.success: true`

3. **Check user info**:

   ```bash
   curl -s http://localhost:3000/api/me
   ```

   Should return your user details (not 401)

4. **Access protected routes**:
   - `/chat` - Should work
   - `/admin` - Should work (if user ID is in `APPWRITE_ADMIN_USER_IDS`)

## Key Takeaways

1. **SSR requires server SDK** (`node-appwrite`, not `appwrite`)
2. **API key is mandatory** for creating sessions with `secret` property
3. **Always use `session.secret`** as cookie value, never `session.$id`
4. **Admin client != elevated permissions** - it just means "can create SSR sessions"

## References

- [Appwrite SSR Authentication Docs](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Creating Email/Password Sessions](https://appwrite.io/docs/products/auth/server-side-rendering#creating-sessions)
- [Node.js Server SDK](https://appwrite.io/docs/sdks#server)
