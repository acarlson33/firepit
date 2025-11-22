# Feature Flags Quick Start Guide

Need to add a feature flag? Here's the fastest way:

## 3-Step Process

### 1. Edit `src/lib/feature-flags.ts`

Add your flag in **three places** (search for `ALLOW_USER_SERVERS` and add yours next to it):

```typescript
// Step 1a: Add to FEATURE_FLAGS constant
export const FEATURE_FLAGS = {
  ALLOW_USER_SERVERS: "allow_user_servers",
  YOUR_NEW_FLAG: "your_new_flag", // ← Add here
} as const;

// Step 1b: Add to DEFAULT_FLAGS
const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
  [FEATURE_FLAGS.YOUR_NEW_FLAG]: true, // ← Add here
};

// Step 1c: Add to descriptions
function getFeatureFlagDescription(key: FeatureFlagKey): string {
  const descriptions: Record<FeatureFlagKey, string> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: "Allow members to create their own servers",
    [FEATURE_FLAGS.YOUR_NEW_FLAG]: "Description of what this flag does", // ← Add here
  };
  return descriptions[key] || "";
}
```

### 2. Edit `src/app/admin/feature-flags.tsx`

Add the same description to the client-side component:

```typescript
function getDefaultDescription(key: string): string {
  const descriptions: Record<string, string> = {
    allow_user_servers: "Allow members to create their own servers",
    your_new_flag: "Description of what this flag does", // ← Add here (note: lowercase key)
  };
  return descriptions[key] || "";
}
```

### 3. Use Your Flag

In any server-side code:

```typescript
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

const isEnabled = await getFeatureFlag(FEATURE_FLAGS.YOUR_NEW_FLAG);

if (!isEnabled) {
  throw new Error("This feature is currently disabled");
}

// ... your feature code
```

## That's It!

The flag will automatically:
- ✅ Appear in the admin panel with a toggle switch
- ✅ Be initialized with your default value
- ✅ Be cached for performance
- ✅ Be strongly-typed with TypeScript

## Example: Real Implementation

Here's how we added the audit logging flag:

```typescript
// 1. In src/lib/feature-flags.ts
export const FEATURE_FLAGS = {
  ALLOW_USER_SERVERS: "allow_user_servers",
  ENABLE_AUDIT_LOGGING: "enable_audit_logging", // Added
} as const;

const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.ALLOW_USER_SERVERS]: false,
  [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: true, // Added - default ON
};

function getFeatureFlagDescription(key: FeatureFlagKey): string {
  const descriptions: Record<FeatureFlagKey, string> = {
    [FEATURE_FLAGS.ALLOW_USER_SERVERS]: "Allow members to create their own servers",
    [FEATURE_FLAGS.ENABLE_AUDIT_LOGGING]: "Enable audit logging for moderation actions", // Added
  };
  return descriptions[key] || "";
}

// 2. In src/app/admin/feature-flags.tsx
function getDefaultDescription(key: string): string {
  const descriptions: Record<string, string> = {
    allow_user_servers: "Allow members to create their own servers",
    enable_audit_logging: "Enable audit logging for moderation actions", // Added
  };
  return descriptions[key] || "";
}

// 3. Use it (e.g., in src/lib/audit.ts)
import { getFeatureFlag, FEATURE_FLAGS } from "./feature-flags";

export async function logAuditEvent(event: AuditEvent) {
  const enabled = await getFeatureFlag(FEATURE_FLAGS.ENABLE_AUDIT_LOGGING);
  if (!enabled) return; // Silently skip
  
  // Log the event...
}
```

Total lines changed: **6 lines**. Total time: **2 minutes**.

## Naming Conventions

- **Constant Name**: `SCREAMING_SNAKE_CASE`
- **Key Value**: `snake_case`
- **Description**: Start with a verb (Enable, Allow, Show, etc.)

Examples:
- ✅ `ENABLE_CUSTOM_EMOJIS` → `"enable_custom_emojis"` → "Enable custom emoji uploads"
- ✅ `ALLOW_GUEST_ACCESS` → `"allow_guest_access"` → "Allow guest users to browse"
- ✅ `SHOW_BETA_FEATURES` → `"show_beta_features"` → "Show experimental features"

## When to Use `true` vs `false` as Default

**Use `false` (disabled by default):**
- New experimental features
- Features that could impact performance
- Features that change user experience significantly
- Features requiring additional configuration

**Use `true` (enabled by default):**
- Existing features being flagged for future removal
- Safety/security features
- Features that improve experience without downsides
- Logging/monitoring features

## Common Patterns

### Pattern 1: Guard Clause (Recommended)

```typescript
const enabled = await getFeatureFlag(FEATURE_FLAGS.YOUR_FLAG);
if (!enabled) {
  throw new Error("Feature disabled");
}
// Continue with normal logic
```

### Pattern 2: Conditional Feature

```typescript
const enabled = await getFeatureFlag(FEATURE_FLAGS.YOUR_FLAG);
return enabled ? advancedImplementation() : basicImplementation();
```

### Pattern 3: Silent Skip

```typescript
const enabled = await getFeatureFlag(FEATURE_FLAGS.YOUR_FLAG);
if (!enabled) return; // Silently skip
// Execute feature
```

## Testing Your Flag

```typescript
// In tests, bypass the flag check if the function supports it
await yourFunction({ bypassFeatureCheck: true });

// Or mock the feature flags module
vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlag: vi.fn(() => Promise.resolve(true)),
  FEATURE_FLAGS: { YOUR_FLAG: "your_flag" },
}));
```

## Need More Details?

See [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) for complete documentation.
