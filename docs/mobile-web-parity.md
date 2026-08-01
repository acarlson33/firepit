# Mobile-Web Parity Tracker

Last updated: 2026-07-02

This document tracks feature parity gaps between the Firepit mobile (Expo/React Native) and web (Next.js) apps. Gated by difficulty into three tiers. Check items off as they are completed.

---

## Tier 1 — Quick wins (a few hours each)

Already partially wired or need minimal new UI.

| # | Gap | Effort | Notes | Done |
|---|-----|--------|-------|------|
| 1 | Reactions in DMs | Low | `onToggleReaction` wired in both DM and channel screens | ✓ |
| 2 | Image/file upload in DMs | Low | `ChatInput` handles attachments; `sendDirectMessage` uploads before sending | ✓ |
| 4 | Pin message action | Low-Medium | `ChatBubbleMessage` shows pin badge; `onTogglePin` wired in both screens | ✓ |

---

## Tier 2 — Medium effort (half-day to a day each)

Require new screens or significant feature work.

| # | Gap | Effort | Notes | Done |
|---|-----|--------|-------|------|
| 7 | Message actions (reply/edit/delete) | Medium | Long-press context menu shows reply/edit/delete options; edit state + reply preview wired in DM and channel screens | ✓ |
| 8 | DM pinning | Medium | Pin/unpin in action sheet, optimistic local state, pinned messages panel | ✓ |
| 9 | DM muting | Medium | Mute/unmute via API, mute button + muted indicator + long-press in DM list | ✓ |
| 10 | Inbox/Triage screen | Medium | Inbox screen complete with digest API, filters, mark-as-read; push notifications fully wired (Expo Push API + server dispatch) | ✓ |
| 11 | Profile pages | Medium | Mobile `/user/[userId]` enhanced with avatar frames, profile backgrounds, status dots, relationship management (friend/block), report user | ✓ |
| 12 | Thread replies in DM | Medium-High | Inline thread panel within DM screen; slide-in panel with parent message, threaded replies, and composer | ✓ |
| 13 | Announcement channel support | Medium | Read-only banner with megaphone icon + "ANNOUNCEMENT" badge; composer disabled for non-managers using permissions API | ✓ |
| 3 | Custom emoji picker | Medium | Custom emojis already render in messages; `EmojiPickerSheet` component with custom emoji tab, wired in DM and channel screens | ✓ |
| 5 | Typing indicators | Medium | Needs Appwrite Presences + real-time subscription + header display (replaces original "Low-Medium" estimate) | ✓ |
| 6 | Status/presence | Medium | Web has `useStatusSubscription`; mobile needs presence indicator in DM header + realtime status subscription | ✓ |

---

## Tier 3 — Large effort (multiple days)

Complex features with significant UX implications.

| # | Gap | Effort | Notes | Done |
|---|-----|--------|-------|------|
| 14 | Poll creation | High | Poll creation modal in ChatInput composer; server-side DM poll support | ✓ |
| 15 | GIF/Sticker picker | High | Need picker UI component in `ChatInput` + GIF search integration | ✓ |
| 16 | Friends system | High | Friends list, incoming/outgoing requests, accept/decline/remove with pull-to-refresh | ✓ |
| 17 | DM encryption | High | XChaCha20-Poly1305 via react-native-libsodium; keypair in SecureStore; encrypt/decrypt wired in DM send/receive flow; lock icon + "End-to-end encrypted" badge in header | ✓ |
| 18 | Message search | High | Mobile search page connects to search API with results UI, navigation to channel/DM context | ✓ |
| 19 | Thread replies in channel (inline) | High | Inline thread panel within channel screen; same component as DM thread panel, with reply count update | ✓ |
| 20 | Message context menu parity | High | Pin available for managers in channels; long-press menu shows pin for all messages in DMs | ✓ |

---

## Completed

| Feature | Date | Notes |
|---------|------|-------|
| Channel categories on mobile | 2026-06-20 | Mobile now fetches and groups channels by category, matching web sidebar |
| DM conversation profile enrichment | 2026-06-20 | `/api/me` response normalized; `displayName`/`userName`/`avatarUrl` merged from profile endpoint |
| DM page layout parity | 2026-06-20 | Rewrote DM chat page to match channel messages layout (thin header, message area, `ChatInput` composer) |
| Duplicate conversation cleanup | 2026-06-20 | Script at `scripts/prune-duplicate-conversations.ts` found and cleaned 36 empty duplicate conversations |
| Settings page display name | 2026-06-20 | `fetchCurrentUser` now calls `normalizeCurrentUser`; `resolveCurrentUser` fetches profile for `displayName` |
| Reactions in DMs | 2026-06-20 | `onToggleReaction` and `toggleReaction` already wired in DM screen |
| Image/file upload in DMs | 2026-06-20 | `sendDirectMessage` now uploads images/files before sending; `ChatInput` attachments wired |
| Batch profile API auth | 2026-06-20 | All `/api/profiles/batch` calls now include `Authorization: Bearer` header |
|| Pin message action | 2026-06-20 | `pinDirectMessage`/`unpinDirectMessage`/`pinChannelMessage`/`unpinChannelMessage` API clients added; `onTogglePin` wired in both DM and channel screens |
| Inbox screen | 2026-06-20 | New inbox tab with digest API, filter tabs (All/Mentions/Direct/Servers), mark-as-read, navigation to messages |
| Push notification hook | 2026-06-20 | `use-push-notifications.ts` created with registration, foreground/background handlers, navigation on tap |
| Push token server API | 2026-06-20 | `POST /api/notifications/register-token` stores Expo push tokens per user |
| Push dispatch API | 2026-06-20 | `POST /api/notifications/push` looks up user tokens and dispatches notifications |
| Push provider wiring | 2026-06-20 | Provider registers token server-side + `usePushNotificationHandler` handles incoming notifications |
| Expo Push API dispatch | 2026-06-20 | `POST /api/notifications/push` sends real push notifications via `https://exp.host/--/api/v2/push/send` |
| Push tokens collection setup | 2026-06-20 | `setup-appwrite.ts` now creates `push_tokens` collection with userId, token, platform, updatedAt + indexes |
| Push trigger on DM send | 2026-06-20 | DM creation route calls `dispatchPushNotification` for the recipient |
|| Push trigger on channel mention | 2026-06-20 | Channel message creation route calls `dispatchPushNotification` for @mentioned users |
|| Push utility module | 2026-06-20 | `src/lib/push-notifications.ts` shared helper with Expo SDK batching + token lookup |
|| Typing indicators | 2026-06-26 | `use-typing-indicator.ts` hook + `TypingIndicator` component; shows who's typing in channel + DM header |
|| Status/presence | 2026-06-26 | `use-status-subscription.ts` hook; DM header shows Online/Away/Do Not Disturb with color indicator |
|| Message actions (reply/edit/delete) | 2026-06-30 | Long-press context menu with inline reply/edit/delete actions; edit state + reply preview in DM and channel screens |
|| Profile pages | 2026-06-30 | `/user/[userId]` enhanced with avatar frames, profile backgrounds, status dots, relationship management (friend/block/report), clickable website |
|| Announcement channel support | 2026-06-30 | Read-only banner with megaphone icon + "ANNOUNCEMENT" badge in header; composer disabled for non-managers via permissions API |
|| Custom emoji picker | 2026-06-30 | `EmojiPickerSheet` component with custom emoji tab, wired in DM and channel message screens |
|| DM pinning | 2026-07-01 | Pin/unpin in action sheet, optimistic state update, pinned messages panel in DM screen |
|| DM muting | 2026-07-01 | Mute/unmute API client, mute button + muted indicator + long-press in DM conversation list |
|| Thread replies in DM (inline) | 2026-07-01 | Inline thread panel within DM screen with parent message, threaded replies, and composer |
|| Message search | 2026-07-01 | Search screen with API client, results UI with context labels, navigation to channel/DM |
|| Thread replies in channel (inline) | 2026-07-02 | Inline thread panel within channel screen; refactored ThreadPanel to support DM and channel |
|| Friends system | 2026-07-02 | Friends list with 3 tabs (Friends/Incoming/Outgoing), accept/decline/remove actions, pull-to-refresh |
|| Message context menu parity | 2026-07-02 | Pin condition changed to (isMine || canManageMessages); wired in DM (always true) and channel (from permissions) |
|| DM encryption | 2026-07-02 | XChaCha20-Poly1305 via react-native-libsodium; keypair in SecureStore; encrypt/decrypt wired in DM send/receive; lock icon + "End-to-end encrypted" badge |
|| GIF/Sticker picker | 2026-07-02 | New GifStickerPicker component with GIF search (/api/gifs/search) and sticker packs (/api/stickers); wired via onOpenGifStickerPicker prop in ChatInput; GIF button in composer for DM and channel screens; remote attachments skip upload |
