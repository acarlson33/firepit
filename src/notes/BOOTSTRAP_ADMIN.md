# Bootstrap Admin Access

## Problem

You need admin access to create teams and configure the instance, but admin access is controlled by team membership - a chicken-and-egg problem.

## Solution

Use the `APPWRITE_ADMIN_USER_IDS` environment variable to bootstrap your first admin user.

## Steps

### 1. Get Your User ID

After logging in successfully, visit:

```
http://localhost:3000/api/me
```

This will show you a JSON response like:

```json
{
  "userId": "67890abcdef12345",
  "name": "Your Name",
  "email": "you@example.com",
  "roles": {
    "isAdmin": false,
    "isModerator": false
  },
  "message": "Copy your userId above and add it to .env.local as APPWRITE_ADMIN_USER_IDS"
}
```

Copy the `userId` value.

### 2. Create/Update .env.local

Create a `.env.local` file in your project root (or copy from `.env.local.example`):

```bash
# Your other environment variables...
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=68b230a0002245833242

# Bootstrap admin access with your user ID
APPWRITE_ADMIN_USER_IDS=67890abcdef12345
```

If you need multiple bootstrap admins, separate them with commas:

```bash
APPWRITE_ADMIN_USER_IDS=user-id-1,user-id-2,user-id-3
```

### 3. Restart Your Dev Server

```bash
# Stop the current dev server (Ctrl+C)
bun run dev
```

### 4. Access Admin Panel

Now you should be able to access:

```
http://localhost:3000/admin
```

## How It Works

The role checking system (`src/lib/appwrite-roles.ts`) checks three things in order:

1. **User ID Overrides** (highest priority)
   - `APPWRITE_ADMIN_USER_IDS` - comma-separated list of admin user IDs
   - `APPWRITE_MODERATOR_USER_IDS` - comma-separated list of moderator user IDs
2. **Team Membership** (normal operation)

   - `APPWRITE_ADMIN_TEAM_ID` - team ID for admin role
   - `APPWRITE_MODERATOR_TEAM_ID` - team ID for moderator role

3. **Default** - no roles

The override system is designed for bootstrapping and development. Once you create your admin team in Appwrite:

1. Go to the Appwrite Console
2. Create a team called "Admins" (or whatever you prefer)
3. Add yourself to the team
4. Copy the team ID
5. Set `APPWRITE_ADMIN_TEAM_ID=<team-id>` in `.env.local`
6. Remove the `APPWRITE_ADMIN_USER_IDS` override (optional - it will be ignored once team membership works)

## Troubleshooting

### Still can't access /admin after setting the user ID?

1. Make sure you restarted the dev server after changing `.env.local`
2. Check that the user ID exactly matches what `/api/me` shows
3. Try clearing your browser cache/cookies and logging in again
4. Check the server logs for any errors

### How do I remove bootstrap access later?

Simply remove or comment out the `APPWRITE_ADMIN_USER_IDS` line from `.env.local` once your team-based permissions are working.
