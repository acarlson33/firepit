# Authentication & Protected Routes

## Overview

The application uses a two-layer authentication approach:

1. **Middleware** - Checks for session cookies and redirects unauthenticated users
2. **Server-side helpers** - Validates roles for admin/moderator access

## Protected Routes

### Routes requiring authentication:

- `/chat` - All authenticated users
- `/admin/*` - Admin users only
- `/moderation` - Moderator or admin users

### Public routes:

- `/` - Landing page
- `/login` - Login/register page

## How it Works

### Middleware (`src/middleware.ts`)

The middleware runs on every request and:

1. Checks for the Appwrite session cookie (`a_session_${projectId}`)
2. Redirects to `/login?redirect=/original-path` if accessing protected routes without auth
3. Redirects logged-in users away from `/login` to their intended destination

**Key features:**

- Preserves intended destination in `redirect` query parameter
- Automatically redirects after login to the original requested page
- Prevents authenticated users from accessing login page

### Server Auth Helpers (`src/lib/auth-server.ts`)

For server components and server actions:

```typescript
// Get current session (returns null if not authenticated)
const user = await getServerSession();

// Require authentication (throws if not authenticated)
const user = await requireAuth();

// Require admin role
const { user, roles } = await requireAdmin();

// Require moderator or admin
const { user, roles } = await requireModerator();
```

**Usage in pages:**

```typescript
export default async function AdminPage() {
  const { user } = await requireAdmin().catch(() => {
    redirect("/");
  });
  // ... rest of page
}
```

### Client Auth Hook (`src/app/chat/hooks/useAuth.ts`)

For client components:

```typescript
const { userId, userName, loading } = useAuth();
```

**Note:** Middleware handles redirect, so the hook doesn't need to redirect anymore. It just provides user state for the UI.

## Login Flow

1. User visits `/admin` (protected route)
2. Middleware detects no session → redirects to `/login?redirect=/admin`
3. User logs in successfully
4. Login page reads `redirect` param and navigates to `/admin`
5. Middleware allows access (session cookie present)
6. Admin page checks role via `requireAdmin()` helper

## Role-Based Access

Roles are stored in Appwrite and checked via `getUserRoles()`:

- **isModerator**: Can access `/moderation`, perform soft delete/restore
- **isAdmin**: Can access `/admin/*`, perform hard deletes, view audit logs

## Session Management

Sessions are managed via Appwrite cookies:

- Cookie name: `a_session_${projectId}`
- Set by Appwrite SDK during login
- Cleared by calling `logout()` from `@/lib/appwrite-auth`

## Why Not tRPC?

This architecture uses:

- **Next.js Server Actions** for mutations (moderation actions)
- **React Server Components** for data fetching (admin pages)
- **Appwrite SDK** for direct API calls

tRPC would add unnecessary complexity since:

- Server Actions provide type-safe RPC already
- Appwrite SDK handles the API layer
- No need for a separate API server/router layer

## Testing

Tests mock the auth layer via:

```typescript
vi.mock("../lib/auth-server", () => ({
  requireModerator: vi.fn().mockResolvedValue({
    user: { $id: "testUser" },
    roles: { isModerator: true, isAdmin: false },
  }),
}));
```

## Security Notes

- Middleware runs on edge runtime for fast redirects
- Session validation happens server-side (never trust client)
- Role checks happen in both page load AND server actions
- Rate limiting implemented in moderation actions
- Audit logging for all moderation activities
