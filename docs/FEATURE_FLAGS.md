# Feature Flags System

The Firepit feature flags system provides a flexible, database-backed way to control instance-level features through the admin panel. This allows administrators to enable or disable features without code deployments.

## Architecture

### Components

1. **Database Collection** (`feature_flags`): Stores feature flag state
2. **Library Module** (`src/lib/feature-flags.ts`): Core feature flag logic
3. **Admin UI** (`src/app/admin/feature-flags.tsx`): Toggle feature flags in admin panel
4. **Server Actions** (`src/app/admin/actions.ts`): Admin-only flag update operations

### Key Features

- **Caching**: Feature flag values are cached for 1 minute to reduce database queries
- **Default Values**: Each flag has a safe default value
- **Admin-Only Management**: Only administrators can modify feature flags
- **Type Safety**: Full TypeScript support with strongly-typed flag keys
- **Extensible Design**: Easy to add new flags without changing the core system

## Current Feature Flags

| Flag Key | Default | Description |
|----------|---------|-------------|
| `allow_user_servers` | `false` | Allow members to create their own servers |

## Adding a New Feature Flag

Adding a new feature flag is a **4-step process**:

### Step 1: Define the Flag Key

Add your new flag to the `FEATURE_FLAGS` constant in `src/lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  ALLOW_USER_SERVERS: "allow_user_servers",
  // Add your new flag here:
  ENABLE_CUSTOM_EMOJIS: "enable_custom_emojis",
} as const;
```

### Step 2: Set the Default Value

Add the default value to the `DEFAULT_FLAGS` object:

```typescript
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
  // Add your default here:
  [FEATURE_FLAGS.ENABLE_CUSTOM_EMOJIS]: true,
};
```

### Step 3: Add a Description

Add a human-readable description in the `getFeatureFlagDescription` function:

```typescript
function getFeatureFlagDescription(key: FeatureFlagKey): string {
  const descriptions: Record<FeatureFlagKey, string> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: "Allow members to create their own servers",
    // Add your description here:
    [FEATURE_FLAGS.ENABLE_CUSTOM_EMOJIS]: "Allow users to upload and use custom emojis",
  };

  return descriptions[key] || "";
}
```

### Step 4: Use the Flag in Your Code

#### Server-Side Usage (Recommended)

For server actions, API routes, or server components:

```typescript
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

export async function uploadCustomEmoji(emojiData: string) {
  // Check if the feature is enabled
  const customEmojisEnabled = await getFeatureFlag(
    FEATURE_FLAGS.ENABLE_CUSTOM_EMOJIS
  );
  
  if (!customEmojisEnabled) {
    throw new Error("Custom emojis are currently disabled");
  }
  
  // ... rest of your logic
}
```

#### Client-Side Usage

For client components, fetch the flag value via a server action:

```typescript
// In your server action file (e.g., src/app/emojis/actions.ts)
"use server";
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

export async function checkCustomEmojisEnabled(): Promise<boolean> {
  return getFeatureFlag(FEATURE_FLAGS.ENABLE_CUSTOM_EMOJIS);
}

// In your client component
"use client";
import { checkCustomEmojisEnabled } from "./actions";

export function EmojiUploader() {
  const [enabled, setEnabled] = useState(false);
  
  useEffect(() => {
    checkCustomEmojisEnabled().then(setEnabled);
  }, []);
  
  if (!enabled) {
    return <div>Custom emojis are disabled</div>;
  }
  
  return <div>Upload your emoji...</div>;
}
```

## API Reference

### `getFeatureFlag(key: FeatureFlagKey): Promise<boolean>`

Retrieves the current value of a feature flag.

- **Returns**: The flag's boolean value
- **Caching**: Results are cached for 1 minute
- **Fallback**: Returns the default value if the flag doesn't exist or on error

```typescript
const isEnabled = await getFeatureFlag(FEATURE_FLAGS.ALLOW_USER_SERVERS);
```

### `setFeatureFlag(key: FeatureFlagKey, enabled: boolean, userId: string): Promise<boolean>`

Updates a feature flag value (admin only).

- **Parameters**:
  - `key`: The feature flag key
  - `enabled`: The new boolean value
  - `userId`: ID of the admin making the change
- **Returns**: `true` if successful, `false` otherwise
- **Side Effects**: Clears the cache for this flag

```typescript
const success = await setFeatureFlag(
  FEATURE_FLAGS.ALLOW_USER_SERVERS,
  true,
  currentUserId
);
```

### `getAllFeatureFlags(): Promise<FeatureFlag[]>`

Retrieves all feature flags from the database.

- **Returns**: Array of all feature flags
- **Use Case**: Displaying flags in the admin panel

### `initializeFeatureFlags(userId: string): Promise<void>`

Initializes any missing feature flags with their default values.

- **Use Case**: Run during setup or first admin login
- **Idempotent**: Safe to call multiple times

### `clearFeatureFlagsCache(): void`

Manually clears the feature flags cache.

- **Use Case**: Testing or forced cache refresh
- **Note**: Cache is automatically cleared when flags are updated

## Database Schema

The `feature_flags` collection has the following structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$id` | string | Yes | Document ID |
| `key` | string | Yes | Unique flag identifier |
| `enabled` | boolean | Yes | Whether the flag is enabled |
| `description` | string | No | Human-readable description |
| `updatedAt` | string | No | ISO timestamp of last update |
| `updatedBy` | string | No | User ID who last updated the flag |

## Admin Panel

Administrators can manage feature flags through the admin panel at `/admin`:

1. Navigate to the Admin Panel
2. Scroll to the "Feature Flags" section
3. Toggle any flag on or off
4. Changes take effect immediately (after cache expiry)

## Best Practices

### 1. Choose Descriptive Flag Names

Use clear, action-oriented flag names:

- ✅ `allow_user_servers`
- ✅ `enable_custom_emojis`
- ❌ `feature_1`
- ❌ `new_thing`

### 2. Set Safe Defaults

Default values should be the **safest option**:

- For new features: `false` (opt-in)
- For existing features being flagged: `true` (maintain current behavior)
- For experimental features: `false` (conservative)

### 3. Document Your Flags

Always add a clear description explaining:
- What the flag controls
- What happens when it's enabled/disabled
- Any dependencies or requirements

### 4. Handle Flag Checks Gracefully

Always provide a good user experience when features are disabled:

```typescript
if (!featureEnabled) {
  return {
    error: "This feature is currently disabled. Contact an administrator.",
  };
}
```

### 5. Clean Up Unused Flags

When a feature is fully rolled out or removed:
1. Remove the flag from code
2. (Optional) Delete the database record
3. Update this documentation

## Testing

### Unit Tests

Feature flag keys and structure are tested in `src/__tests__/feature-flags.test.ts`.

### Testing with Flags

In tests, you can control feature flag behavior:

```typescript
// Option 1: Use bypass in functions that support it
await createServer("Test Server", { bypassFeatureCheck: true });

// Option 2: Mock the feature flags module (for complex scenarios)
vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlag: vi.fn(() => Promise.resolve(true)),
  FEATURE_FLAGS: { ALLOW_USER_SERVERS: "allow_user_servers" },
}));
```

## Troubleshooting

### Cache Not Clearing

If feature flag changes don't appear immediately:

1. **Wait 1 minute** - Cache expires automatically
2. **Restart the server** - Clears all in-memory state
3. **Check browser cache** - Client-side code may cache responses

### Feature Flag Not Appearing in Admin Panel

If a new flag doesn't show in the admin panel:

1. Verify the flag is added to `FEATURE_FLAGS` constant
2. Verify the flag has a default value in `DEFAULT_FLAGS`
3. Verify the flag has a description in `getFeatureFlagDescription`
4. Check browser console for any errors
5. Restart the development server

### Database Errors

If you get database connection errors:

1. Verify `APPWRITE_API_KEY` is set in your environment
2. Run `bun run setup` to ensure the collection exists
3. Check database permissions for the API key

## Migration Guide

If you need to migrate existing boolean settings to feature flags:

1. Add the feature flag as described above
2. Set the default to match current behavior
3. (Optional) Create a migration script to populate from existing settings
4. Update code to use `getFeatureFlag` instead of the old setting
5. Test thoroughly
6. Deploy
7. Remove old setting code after verification

## Example: Complete Feature Flag Implementation

Here's a complete example of adding a "enable_audit_logging" feature flag:

```typescript
// 1. In src/lib/feature-flags.ts - Add constant
export const FEATURE_FLAGS = {
  ALLOW_USER_SERVERS: "allow_user_servers",
  ENABLE_AUDIT_LOGGING: "enable_audit_logging", // NEW
} as const;

// 2. Add default value
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
  [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: true, // NEW - default to enabled
};

// 3. Add description
function getFeatureFlagDescription(key: FeatureFlagKey): string {
  const descriptions: Record<FeatureFlagKey, string> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: "Allow members to create their own servers",
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: "Log moderation actions to the audit log", // NEW
  };
  return descriptions[key] || "";
}

// 4. Use in your code (e.g., in src/lib/audit.ts)
import { getFeatureFlag, FEATURE_FLAGS } from "./feature-flags";

export async function logAuditEvent(event: AuditEvent) {
  const auditEnabled = await getFeatureFlag(FEATURE_FLAGS.ENABLE_AUDIT_LOGGING);
  
  if (!auditEnabled) {
    // Silently skip - no error needed
    return;
  }
  
  // Log the event
  await databases.createDocument(/* ... */);
}
```

That's it! The flag will automatically appear in the admin panel with a toggle switch.

## Future Enhancements

Potential improvements to the feature flag system:

- **User-Level Flags**: Enable features for specific users or roles
- **Percentage Rollouts**: Enable features for a percentage of users
- **Scheduling**: Automatically enable/disable flags at specific times
- **A/B Testing**: Support for feature variants
- **Flag Dependencies**: Define relationships between flags
- **Change History**: Track who changed flags and when

## Support

For questions or issues with the feature flag system:

1. Check this documentation
2. Review the example implementations in the codebase
3. Open an issue on GitHub
4. Contact the development team
