# Deployment Guide

This guide walks you through deploying **Firepit** from scratch on a new instance, with no code editing required.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
  - [1. Appwrite Setup](#1-appwrite-setup)
  - [2. Environment Configuration](#2-environment-configuration)
  - [3. Database Initialization](#3-database-initialization)
  - [4. Initial Deployment](#4-initial-deployment)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ or **Bun** installed
- **Appwrite** instance (cloud or self-hosted)
  - Cloud: Sign up at [https://appwrite.io](https://appwrite.io)
  - Self-hosted: Follow [Appwrite Installation](https://appwrite.io/docs/installation)
- **Git** for cloning the repository

---

## Quick Start

For experienced users who want to get running fast:

```bash
# 1. Clone and install
git clone https://github.com/acarlson33/firepit.git
cd firepit
bun install

# 2. Configure Appwrite
cp .env.local.example .env.local
# Edit .env.local with your Appwrite credentials

# 3. Bootstrap database
bun run setup

# 4. Start development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) and create your first account!

---

## Detailed Setup

### 1. Appwrite Setup

#### A. Create Appwrite Project

1. Log into your Appwrite Console
2. Click **"Create Project"**
3. Name it (e.g., "Firepit Chat")
4. Note your **Project ID** - you'll need this!

#### B. Create API Key

The setup script needs an API key with full permissions:

1. In Appwrite Console, go to **Settings → API Keys**
2. Click **"Create API Key"**
3. Name: `Firepit Setup Key`
4. **Scopes Required:**
   - `databases.read` and `databases.write`
   - `collections.read` and `collections.write`
   - `attributes.read` and `attributes.write`
   - `indexes.read` and `indexes.write`
   - `teams.read` and `teams.write` (unless using `SKIP_TEAMS=true`)
5. **Expiration:** Set to "Never" or a long duration
6. Copy the API key immediately - you won't see it again!

#### C. Configure Authentication

1. Go to **Auth → Settings**
2. Enable your preferred auth methods:
   - **Email/Password** (recommended for getting started)
   - OAuth providers (GitHub, Google, etc.)
3. Set **Session Length** as desired (default: 365 days)

---

### 2. Environment Configuration

#### A. Copy Example File

```bash
cp .env.local.example .env.local
```

#### B. Edit `.env.local`

Open `.env.local` and fill in your values:

```bash
# === REQUIRED: Appwrite Connection ===
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
# ☝️ Use your Appwrite Cloud region or self-hosted URL

APPWRITE_PROJECT_ID=your-project-id-here
# ☝️ From Step 1A - find this in Appwrite Console

APPWRITE_API_KEY=your-api-key-here
# ☝️ From Step 1B - the full API key you just created

# === OPTIONAL: Collection IDs ===
# Leave these with default values - setup script will create them
# Only change if you have existing collections to use

APPWRITE_DATABASE_ID=main
APPWRITE_SERVERS_COLLECTION_ID=servers
APPWRITE_CHANNELS_COLLECTION_ID=channels
APPWRITE_MESSAGES_COLLECTION_ID=messages
# ... (more collections with defaults)

# === OPTIONAL: Admin & Moderator Setup ===
# You can bootstrap admins two ways:
# 1. By User ID (before teams exist)
# 2. By Team ID (after running setup script)

# Method 1: Bootstrap by User IDs
# Visit /api/me after creating your first account to get your user ID
APPWRITE_ADMIN_USER_IDS=your-user-id-here
APPWRITE_MODERATOR_USER_IDS=

# Method 2: Bootstrap by Team IDs
# The setup script creates these teams automatically
# After setup, add users to teams via Appwrite Console
APPWRITE_ADMIN_TEAM_ID=
APPWRITE_MODERATOR_TEAM_ID=
```

#### C. Validation

Validate your configuration:

```bash
bun run validate-env
```

If you see any errors, double-check your `.env.local` values.

---

### 3. Database Initialization

Run the automated setup script to create all necessary database structures:

```bash
bun run setup
```

**What this does:**

- ✅ Creates `main` database (if it doesn't exist)
- ✅ Creates all collections (servers, channels, messages, profiles, etc.)
- ✅ Sets up attributes with proper types and sizes
- ✅ Creates indexes for query performance
- ✅ Configures storage buckets (avatars)
- ✅ Creates admin and moderator teams
- ✅ Validates API key permissions

**Output:** You should see:

```
[INFO] Checking database 'main'...
[INFO] Database exists.
[INFO] Checking collection 'servers'...
[INFO] Collection exists.
...
[INFO] Setup complete.
```

**Common Issues:**

- **"Missing scopes"**: Your API key needs more permissions (see Step 1B)
- **"Project not found"**: Double-check your `APPWRITE_PROJECT_ID`
- **"Unauthorized"**: Verify your `APPWRITE_API_KEY` is correct

---

### 4. Initial Deployment

#### Development Server

```bash
bun dev
```

Visit [http://localhost:3000](http://localhost:3000)

#### Create Your First Account

1. Click **"Sign Up"** or **"Login"**
2. Register with email and password
3. You're in!

#### Make Yourself Admin (Optional)

**Method 1: Using User ID Bootstrap**

1. Visit [http://localhost:3000/api/me](http://localhost:3000/api/me)
2. Copy your `$id` from the JSON response
3. Add it to `.env.local`:
   ```bash
   APPWRITE_ADMIN_USER_IDS=your-copied-user-id
   ```
4. Restart the dev server
5. Visit [http://localhost:3000/admin](http://localhost:3000/admin) to verify

**Method 2: Using Teams**

1. Go to Appwrite Console → Auth → Teams
2. Find "Admins" team (created by setup script)
3. Click team → Memberships → Add Member
4. Enter your email or user ID
5. Refresh your app - you're now an admin!

---

## Production Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard:
   - All `APPWRITE_*` variables
   - `APPWRITE_API_KEY` (mark as sensitive!)
4. Deploy!

### Self-Hosted Deployment

```bash
# Build production bundle
bun run build

# Start production server
bun start
```

**Environment Variables:**

- Set all variables from `.env.local` in your hosting environment
- Use secrets management for `APPWRITE_API_KEY`
- Ensure `APPWRITE_ENDPOINT` points to your production Appwrite

**Reverse Proxy Setup (Nginx):**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Troubleshooting

### "Appwrite endpoint not configured"

**Cause:** Environment variables not loaded properly

**Fix:**

```bash
# Verify .env.local exists
ls -la .env.local

# Check values are set
grep APPWRITE .env.local

# Restart dev server
bun dev
```

### "The current user is not authorized"

**Cause:** User not authenticated or lacks permissions

**Fix:**

1. Make sure you're logged in
2. Check user has necessary role (admin/moderator)
3. Verify team memberships in Appwrite Console
4. Review collection permissions in Appwrite Console

### Setup Script Fails with "Missing scopes"

**Cause:** API key lacks required permissions

**Fix:**

1. Go to Appwrite Console → Settings → API Keys
2. Delete old key
3. Create new key with ALL scopes from Step 1B
4. Update `APPWRITE_API_KEY` in `.env.local`
5. Re-run `bun run setup`

### Database Already Exists But Script Fails

**Cause:** Partial setup from previous failed run

**Fix:**

1. The script is idempotent - just re-run it
2. It will skip existing resources and create missing ones
3. Safe to run multiple times

### "Cannot find module" errors

**Cause:** Dependencies not installed

**Fix:**

```bash
# Clean install
rm -rf node_modules
bun install

# Verify Bun version (need 1.0+)
bun --version
```

### Port 3000 Already in Use

**Fix:**

```bash
# Use different port
PORT=3001 bun dev

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

---

## Next Steps

- 📖 Read [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow
- 🧪 Run tests with `bun test`
- 🔍 Review [TEST_COVERAGE_30_40_REPORT.md](./TEST_COVERAGE_30_40_REPORT.md) for testing details
- 🛠️ Customize UI in `src/components/`
- 🔐 Review security settings in Appwrite Console

---

## Support

- **Issues:** [GitHub Issues](https://github.com/acarlson33/firepit/issues)
- **Discussions:** [GitHub Discussions](https://github.com/acarlson33/firepit/discussions)
- **Appwrite:** [Appwrite Discord](https://appwrite.io/discord)

---

**Happy Chatting! 🔥💬**
