# Environment Variable Migration Guide

## Overview
This guide helps you update your `.env.local` file after the security improvements that removed the `NEXT_PUBLIC_` prefix from environment variables.

## Why This Change?
Environment variables with the `NEXT_PUBLIC_` prefix are exposed in the client-side JavaScript bundle, which could potentially leak sensitive configuration. By removing this prefix, all Appwrite configuration is now server-side only, significantly improving security.

## Migration Steps

### 1. Update Your `.env.local` File
Replace the following variable names in your `.env.local` file:

#### Required Variables
```bash
# OLD → NEW
NEXT_PUBLIC_APPWRITE_ENDPOINT → APPWRITE_ENDPOINT
NEXT_PUBLIC_APPWRITE_PROJECT_ID → APPWRITE_PROJECT_ID
```

#### Optional Variables
```bash
# Database and Collections
NEXT_PUBLIC_APPWRITE_DATABASE_ID → APPWRITE_DATABASE_ID
NEXT_PUBLIC_APPWRITE_SERVERS_COLLECTION_ID → APPWRITE_SERVERS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_CHANNELS_COLLECTION_ID → APPWRITE_CHANNELS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID → APPWRITE_MESSAGES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID → APPWRITE_MEMBERSHIPS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_TYPING_COLLECTION_ID → APPWRITE_TYPING_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID → APPWRITE_PROFILES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_CONVERSATIONS_COLLECTION_ID → APPWRITE_CONVERSATIONS_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_DIRECT_MESSAGES_COLLECTION_ID → APPWRITE_DIRECT_MESSAGES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_STATUSES_COLLECTION_ID → APPWRITE_STATUSES_COLLECTION_ID
NEXT_PUBLIC_APPWRITE_AUDIT_COLLECTION_ID → APPWRITE_AUDIT_COLLECTION_ID

# Buckets
NEXT_PUBLIC_APPWRITE_AVATARS_BUCKET_ID → APPWRITE_AVATARS_BUCKET_ID

# Other
NEXT_PUBLIC_ROLE_TEAM_MAP → ROLE_TEAM_MAP
NEXT_PUBLIC_SERVER_URL → SERVER_URL
```

### 2. Quick Migration Script
You can use this one-liner to update your file automatically:

```bash
sed -i.backup 's/NEXT_PUBLIC_APPWRITE_/APPWRITE_/g; s/NEXT_PUBLIC_ROLE_TEAM_MAP/ROLE_TEAM_MAP/g; s/NEXT_PUBLIC_SERVER_URL/SERVER_URL/g' .env.local
```

This creates a backup at `.env.local.backup` and updates the file in place.

### 3. Verify Your Configuration
After updating, verify everything works:

```bash
# Validate environment variables
npm run validate-env

# Run tests
npm test

# Start development server
npm run dev
```

## Example Migration

### Before (Old)
```bash
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=main
APPWRITE_API_KEY=your-api-key
```

### After (New)
```bash
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your-project-id
APPWRITE_DATABASE_ID=main
APPWRITE_API_KEY=your-api-key
```

## Deployment Considerations

### Vercel/Netlify/Appwrite/Other Hosting
If you've set environment variables in your hosting platform's dashboard, you'll need to update them there as well:

1. Go to your project settings
2. Find the environment variables section
3. Rename all `NEXT_PUBLIC_APPWRITE_*` variables to `APPWRITE_*`
4. Redeploy your application

**Note:** The Next.js configuration has been updated to automatically expose these environment variables at runtime. This means:
- Environment variables are available to server-side code without requiring the `NEXT_PUBLIC_` prefix
- Your configuration remains secure and is not exposed to the browser
- Variables are automatically loaded in deployed environments (Vercel, Appwrite, etc.) when set in the platform's environment settings

### CI/CD Pipelines
Update any environment variable references in:
- GitHub Actions workflows
- GitLab CI configurations
- Jenkins pipelines
- Docker Compose files
- Kubernetes secrets/configmaps

## Troubleshooting

### "Appwrite endpoint not configured" Error
Make sure you renamed the variables correctly. Check for:
- Typos in variable names
- Missing variables
- Extra whitespace

### Tests Failing
Run the validation script to check your configuration:
```bash
npm run validate-env
```

### Build Errors
Clear your build cache and reinstall dependencies:
```bash
rm -rf .next node_modules
npm install
npm run build
```

## Security Benefits

✅ Configuration values no longer exposed in client-side bundles
✅ Reduced attack surface for potential exploits
✅ Better alignment with Next.js security best practices
✅ Server-side only access to sensitive Appwrite credentials

## Questions?
If you encounter issues during migration, please open an issue with:
- Your error message
- Steps you've taken
- Your environment (OS, Node version, etc.)
