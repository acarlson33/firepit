# User Server Creation Feature

This feature allows regular users to create their own servers when enabled through the admin panel.

## How It Works

### Feature Flag System

The feature is controlled by the `ALLOW_USER_SERVERS` feature flag which can be toggled by administrators through the Admin Panel at `/admin`.

**Default State:** Disabled (false)

### Components

1. **CreateServerDialog** (`/src/components/create-server-dialog.tsx`)

    - Dialog component for creating a new server
    - Validates server name
    - Calls the server creation API
    - Shows success/error messages

2. **API Endpoint** (`/src/app/api/servers/create/route.ts`)

    - Authenticates the user via session
    - Validates server name
    - Calls `createServer()` which checks the feature flag internally
    - Returns server data or error message

3. **Feature Flag Check** (`/src/app/api/feature-flags/allow-user-servers/route.ts`)

    - Returns the current state of the `ALLOW_USER_SERVERS` flag
    - Used by the UI to show/hide the Create Server button

4. **Chat Page Integration** (`/src/app/chat/page.tsx`)
    - Fetches the feature flag state on mount
    - Shows/hides the Create Server button based on flag
    - Button appears next to the server count in the Servers section

### Server Creation Flow

1. User clicks the "+" button in the Servers section (only visible if feature is enabled)
2. Dialog opens with a form to enter server name
3. User submits the form
4. API creates the server and automatically:
    - Sets the user as the owner
    - Creates a membership record
    - Creates a default "general" channel
    - Sets the initial member count to 1
5. User is notified of success/failure
6. Server list refreshes to show the new server

### Feature Flag Checking

The `createServer()` function in `/src/lib/appwrite-servers.ts` checks the feature flag before creating a server:

```typescript
// Check feature flag unless bypassed (e.g., for admin creation or tests)
if (!options?.bypassFeatureCheck) {
    const allowUserServers = await getFeatureFlag(
        FEATURE_FLAGS.ALLOW_USER_SERVERS
    );
    if (!allowUserServers) {
        throw new Error(
            "Server creation is currently disabled. Contact an administrator."
        );
    }
}
```

### Admin Override

Admins can always create servers through the Admin Panel regardless of the feature flag setting. The admin server creation path uses `bypassFeatureCheck: true`.

## Enabling/Disabling the Feature

### For Administrators

1. Navigate to `/admin` (requires admin role)
2. Scroll to the "Feature Flags" section
3. Toggle the "Allow User Servers" switch
4. The change takes effect immediately for all users

### Testing

Tests use `bypassFeatureCheck: true` to avoid feature flag dependencies:

```typescript
const server = await createServer("Test Server", { bypassFeatureCheck: true });
```

## User Experience

### When Enabled

-   Users see a "+" button next to the server count
-   Clicking opens a dialog to create a server
-   Upon creation, user becomes the owner with full permissions
-   User can manage their server through the admin panel (shield icon)

### When Disabled

-   No "+" button is shown
-   Users can only join existing servers through the Server Browser
-   API returns an error if someone tries to create a server directly

## Security

-   All server creation requires authentication
-   Feature flag is checked server-side in `createServer()`
-   Cannot be bypassed from the client
-   Admins can always create servers regardless of the flag

## Future Enhancements

Potential improvements:

-   Server creation limits per user
-   Server templates
-   Verification requirements (email, account age, etc.)
-   Server categories
-   Private vs public server options
