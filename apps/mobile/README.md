# firepit mobile

React Native chat app built with Expo SDK 57.

## Prerequisites

- Node.js 20.9.0+
- Bun 1.3.14+ (for build scripts — install from [bun.sh](https://bun.sh))

## Getting started

```bash
npm install
npx expo start
```

## Build scripts

Production builds use Bun:

```bash
bun run build        # production APK/AAB
bun run build:dev    # development APK/AAB
```

## Environment

Copy `.env.example` to `.env.local` and fill in your values:

- `APP_ENV` — `development`, `preview`, or `production`
- `GOOGLE_SERVICES` / `GOOGLE_SERVICES_DEV` — Firebase credentials for push notifications
- `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` — Sentry debug symbol uploads

## Architecture

The app signs in against Appwrite, then uses the returned session secret as a Bearer token for Firepit API calls. On first launch, enter a Firepit instance URL and the app fetches `/api/instance`, caches the Appwrite endpoint and project ID in SQLite, and reuses those on later launches. Session secrets are stored in `expo-secure-store` with device-only accessibility.
