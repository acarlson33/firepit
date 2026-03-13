# Chat And Realtime

## Scope

This document covers the real-time communication surface of Firepit: channel messages, direct messages, reactions, threads, pins, typing indicators, presence, uploads, emoji, search, and notification settings.

## Channel Messaging

Channel messages are created through `POST /api/messages` and support more than plain text.

Supported message features:

- plain text content
- image attachments
- generic file attachments
- replies through `replyToId`
- mentions through a `mentions` array
- reactions through `/api/messages/{messageId}/reactions`
- per-message thread access through `/api/messages/{messageId}/thread`
- pin and unpin operations through `/api/messages/{messageId}/pin`

Message creation is gated by channel membership and send permissions. The server validates attachment and message size constraints before writing records.

## Direct Messages

Direct message operations are multiplexed through `/api/direct-messages`.

Current supported GET modes:

- `type=conversations`: list the current user’s conversations
- `type=conversation`: fetch or create a conversation between users
- `type=messages`: list messages in a conversation

Direct messages also support:

- create, edit, and delete message operations through `POST`, `PATCH`, and `DELETE`
- reactions through `/api/direct-messages/{messageId}/reactions`
- thread access through `/api/direct-messages/{messageId}/thread`
- pin and unpin through `/api/direct-messages/{messageId}/pin`
- conversation-level pins through `/api/conversations/{conversationId}/pins`
- conversation mute through `/api/conversations/{conversationId}/mute`

## Threads And Pins

Threaded conversations are available for both channel and DM messages. The API exposes separate endpoints for reading and creating thread state on top of a parent message.

Pinning is split across two levels:

- message-level pin and unpin operations
- list pinned items for a channel or conversation

For channel views, pinned history is available at `/api/channels/{channelId}/pins`.

## Cross-Surface Navigation

Search results, pinned items, and thread-entry affordances now resolve through the same client-side message navigation flow in both channels and DMs.

Current navigation behavior:

- search results build routeable chat URLs that preserve the message context through `server`, `channel`, `conversation`, and `highlight` query parameters
- channel and DM chat surfaces consume those query parameters to select the correct context before attempting a message jump
- jump-to-message highlighting is shared across channel chat, DM chat, and pinned-message entry points
- the client relies on existing message identifiers and context identifiers from current APIs rather than a separate navigation endpoint

This keeps search, pins, and thread access behavior aligned across message surfaces without changing the underlying channel and DM REST contracts.

## Typing Indicators

Typing state is managed through `/api/typing`.

Behavior:

- accepts either `channelId` or `conversationId`
- creates or updates a deterministic typing-status record per user and context
- requires channel send access for channel typing updates
- deletes the current user’s typing record when the client stops typing or leaves the context

Typing records are intentionally short-lived and should be treated as ephemeral UI state rather than durable history.

## Presence And Status

Presence is handled through `/api/status` and `/api/status/batch`.

Capabilities:

- set or update a status document
- fetch a single user status or batch status data
- preserve manually set statuses until expiration
- normalize stale or expired records before returning them to clients

Expected status states include `online`, `offline`, `away`, and `dnd`, with optional custom messages and expirations.

## Uploads And Attachments

Firepit separates media upload from message creation.

Current upload endpoints:

- `/api/upload-image`: image upload and deletion
- `/api/upload-file`: generic file upload and deletion
- `/api/upload-emoji`: custom emoji upload and deletion
- `/api/emoji/{fileId}`: emoji file retrieval proxy

Message records may reference uploaded media by file identifier and resolved URL. Attachment metadata is stored separately for richer rendering.

## Emoji And Reactions

Custom emojis are exposed through `/api/custom-emojis`, with upload handled separately. Reaction APIs exist for both channel and direct-message messages, which keeps the client interaction model consistent across contexts.

Client expectations:

- optimistic UI is acceptable, but server responses remain authoritative
- deleted emoji assets should fail gracefully in the UI
- reactions should be displayed consistently across message list, thread view, and pinned views

## Search And Notifications

Chat-adjacent discovery is handled by:

- `/api/search/messages` for message search
- `/api/inbox` for the first unified unread-history aggregation pass across unread threads and mentions
- `/api/inbox/digest` for scoped unread digest payloads used by rollout and diagnostics
- `/api/users/search` for people lookup and mentions
- `/api/notifications/settings` for user notification preferences
- `/api/thread-reads` for persisted per-thread read state across channels and DMs
- `/api/memberships` for membership resolution used by navigation and mention features

Message search responses are expected to provide the context identifiers needed for client navigation so results can deep-link back into either channel or DM chat with a consistent highlight state.

Current notification capabilities include:

- global notification levels: `all`, `mentions`, or `nothing`
- per-server, per-channel, and per-conversation overrides
- mute durations and indefinite mute state through the shared mute flows
- quiet hours with timezone-aware persistence
- desktop, push, and notification sound preferences
- direct-message privacy controls for friend-only DM restrictions
- server-enriched override labels returned from `/api/notifications/settings` so the client can render readable server, channel, and DM names without extra lookups
- bulk override management in settings for clearing expired overrides and resetting channel overrides
- dedicated unread-thread persistence through the `thread_reads` collection so inbox and unread state survive across sessions without expanding the `notification_settings` schema

Current unread-history implementation is intentionally incremental:

- unread thread state is durable today through `/api/thread-reads`
- the first inbox contract aggregates unread conversation and channel thread activity plus mentions into one normalized API shape
- the chat client now uses that inbox contract for DM inbox, mentions, channel badges, DM badges, jump-to-unread, catch-up affordances, and unread boundary markers across both channels and DMs
- `PATCH /api/inbox` supports both mention item read updates and `mark-all-read` context catch-up flows that also persist thread reads
- `GET /api/inbox` supports scoped filtering through `scope=all|direct|server` and kind filtering through `kind`
- mention-only notification levels suppress thread unread entries in inbox aggregation while preserving mention entries
- full per-message unread and digest-style delivery remain follow-on work on top of the shared inbox model

## Unread Semantics Contract (Phase 1)

To support the v1.6 per-message unread rollout safely, unread behavior now follows explicit phase-1 contract rules:

- Inbox responses include a `contractVersion` marker.
- `thread_v1` remains the default contract while per-message unread is gated and rolling out.
- Clients must treat server responses as authoritative for unread reconciliation and anchor targets.
- If an unread anchor references a removed or inaccessible message, clients should degrade to context-level catch-up behavior instead of failing navigation.
- Badge counts, unread boundary markers, and jump-to-unread affordances must all derive from the same inbox aggregation source to avoid cross-surface drift.
- Digest ordering and inbox ordering are both newest-first to avoid context-level drift during rollout validation.
- Digest `totalUnreadCount` is computed from the full scoped unread set before pagination.

This phase is intentionally compatibility-first. It does not yet switch persistence from per-thread to per-message reads by default.

Override precedence is intentionally deterministic:

1. conversation override
2. channel override
3. server override
4. global default

The settings layer also backfills legacy notification-settings documents when older records are missing newly required attributes, which avoids partial-update failures during schema evolution.

## Realtime Design Notes

The app uses Appwrite realtime subscriptions with pooled connections. Clients should assume that:

- server responses are the source of truth
- optimistic updates may be corrected by realtime events
- message, reaction, status, and typing updates can arrive out of order
- pinned and threaded views should handle partial hydration cleanly

## Operational Constraints

- Large JSON responses may advertise compression support.
- Channel access is permission-aware and enforced server-side.
- Typing and status collections may be unavailable in partially configured environments; clients should surface those failures as degraded realtime features rather than full application failure.
