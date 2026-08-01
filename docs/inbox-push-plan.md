# Inbox & Push Notifications — Implementation Plan

## Overview

Build an inbox/triage screen for mobile showing mentions, DMs, and server activity,
plus push notifications so users get alerted when they receive new messages while
the app is backgrounded.

## Architecture

### Data Flow

1. User receives a message → server creates inbox items
2. Server checks if recipient has push notification tokens
3. Server sends push notification via Expo Push API
4. Mobile app receives notification → shows badge / alert
5. User taps notification → app opens to the relevant message

### Key Components

#### Server-side (web app)

- **Push token storage**: New Appwrite collection `push_tokens` to store Expo push tokens
- **Push dispatch API**: New endpoint `POST /api/notifications/push` that sends push notifications
- **Trigger on message send**: When a DM or channel message is created, check recipients and dispatch push

#### Mobile app

- **Inbox screen**: New `src/app/(tabs)/inbox.tsx` showing inbox digest items
- **Push registration**: Register for push notifications on app startup, store token
- **Notification handler**: Handle incoming notifications (foreground + background + killed)
- **Badge count**: Show unread count on inbox tab icon
- **Mark as read**: Tap item → navigate to message + mark as read

## Implementation Steps

### Step 1: Inbox Screen

Create `src/app/(tabs)/inbox.tsx` with:
- Fetch inbox digest from `/api/inbox/digest`
- Filter tabs: All, Mentions, Direct, Servers
- Each item shows: author avatar, author label, preview text, timestamp, unread count
- Tap item → navigate to the message (channel or DM)
- Pull to refresh
- Empty state

### Step 2: Push Notification Registration

In the provider or a dedicated hook:
- Request notification permissions on app startup
- Get Expo push token
- Store token in Appwrite via new API
- Handle token refresh

### Step 3: Notification Handler

Using `expo-notifications`:
- Listen for notifications while app is foregrounded → show in-app banner
- Listen for notification taps → navigate to the relevant message
- Handle background notifications → update badge count

### Step 4: Server-Side Push Dispatch

New API route `POST /api/notifications/push`:
- Accepts: `{ userId, title, body, data }`
- Looks up user's push tokens
- Sends via Expo Push API

Trigger in message creation flow:
- After creating a DM message → dispatch push to recipient
- After creating a channel message → dispatch push to @mentioned users

### Step 5: Badge Count

- Update inbox tab icon with unread count badge
- Clear badge when inbox is opened

## Files to Create/Modify

### New files
- `apps/mobile/src/app/(tabs)/inbox.tsx` — Inbox screen
- `apps/mobile/src/hooks/use-push-notifications.ts` — Push notification hook
- `apps/web/src/app/api/notifications/push/route.ts` — Push dispatch API
- `apps/web/src/app/api/notifications/register-token/route.ts` — Token registration API

### Modified files
- `apps/mobile/src/components/app-tabs.tsx` — Add inbox tab (or add to home)
- `apps/mobile/src/providers/firepit-provider.tsx` — Initialize push notifications
- `apps/web/src/app/api/direct-messages/route.ts` — Trigger push on DM send
- `apps/web/src/app/api/messages/route.ts` — Trigger push on channel message send

## Considerations

- Push notifications require a server-side Expo push token (needs `EXPO_PUSH_ACCESS_TOKEN` env var)
- For development, we can use Expo's built-in push notification service
- The inbox digest API already exists and works with Bearer token auth
- The mobile app already has `expo-notifications` installed
- Notification preferences already exist in the provider
