# Firepit API Route Structures

This file is the mobile-facing map of the current Firepit API surface.

Use the route handler code as the primary source of truth when the handler and the OpenAPI file disagree. The OpenAPI document is still useful for shape hints, but the live route implementation wins.

## Contract Rules

- Mobile clients authenticate with an Appwrite session secret sent as an `Authorization: Bearer <session secret>` header. On Appwrite Cloud the same secret is also sent as `x-firepit-token`, because the edge rewrites `Authorization` to its own operator credential. There is no cookie bootstrap: clients obtain the session secret from `POST /api/auth/session` and reuse it across Firepit API calls (cookies are omitted).
- Most client routes require an authenticated session; public discovery and preview routes are the main exceptions.
- `serverId`, `channelId`, `conversationId`, and `messageId` are the core identifiers used across the app.
- `contextKind` is always `channel` or `conversation` when a route needs context typing.
- `contextId` must travel with `contextKind` when a route requires both.
- Message, thread, pin, inbox, and unread routes are intentionally cross-surface and should be treated as one navigation model.
- Uploads happen first and message creation happens second.
- If a route is multi-mode or overloaded, do not guess a fixed payload shape without checking the current handler.

## Platform And Bootstrap

- `GET /api/version` returns deployed version metadata: `version`, `commit`, `branch`, and `builtAt`.
- `GET /api/me` is a diagnostic bootstrap endpoint that returns the current `userId`, `name`, `email`, and a small `roles` object.
- `GET /api/instance` returns instance metadata used for boot-time configuration.
- `GET /api/feature-flags/allow-user-servers` returns the client-visible `allow-user-servers` flag.

## Servers

- `GET /api/servers` returns the authenticated user's server list as `{ servers, nextCursor }`.
- `GET /api/servers/public` returns public discovery data as `{ servers }` with `ServerPreview` items.
- `POST /api/servers/create` creates a server.
    - Body: `{ name: string; description?: string; iconFileId?: string; bannerFileId?: string; isPublic?: boolean }`
    - Response: `{ server, membership? }`.
- `POST /api/servers/join` joins a public server directly.
    - Body: `{ serverId: string }`
    - Private servers reject with `403` and a JSON error message.
- `GET /api/servers/default-signup` resolves the instance-wide signup default server for admin tooling.
- `PATCH /api/servers/{serverId}` updates server customization and visibility.
    - Body fields: `name`, `description`, `isPublic`, `defaultOnSignup`, `iconFileId`, `bannerFileId`.
    - `defaultOnSignup` is instance-admin only.
- `GET /api/servers/{serverId}/stats` returns member, channel, and message counts.
- `GET /api/servers/{serverId}/members?limit=&cursor=` returns `{ members, nextCursor, orphanCount }`.
- `GET /api/servers/{serverId}/permissions` returns the current user's effective permission map.
- `POST /api/servers/{serverId}/mute` mutes the current user at the server level.
- `POST /api/servers/{serverId}/moderation` applies server moderation.
    - Body: `{ action: "ban" | "unban" | "mute" | "unmute" | "kick"; userId: string; reason?: string }`
- `GET /api/servers/{serverId}/audit-logs` returns audit entries for the server.
- `GET /api/servers/{serverId}/audit-logs/export?format=csv|json` exports audit history.
- `GET|POST /api/servers/{serverId}/invites` lists or creates server invites.
    - Create body: `{ channelId?: string; expiresAt?: string; maxUses?: number; temporary?: boolean }`
- `GET /api/servers/{serverId}/mentionable-roles` returns roles that can be mentioned in the server.

## Channels

- `GET /api/channels?serverId=&limit=&cursor=` returns `{ channels, nextCursor }`.
- `POST /api/channels` creates a channel.
    - Body uses `ChannelCreate` semantics: `{ serverId: string; name: string; type?: "text" | "voice" | "announcement"; topic?: string }`
- `PATCH /api/channels/{channelId}` updates name, category assignment, order, type, or topic.
    - Body fields: `name`, `categoryId`, `position`, `type`, `topic`.
- `DELETE /api/channels/{channelId}` deletes a channel.
- `GET /api/categories?serverId=` lists channel categories for a server.
- `POST /api/categories` creates a category.
    - Body: `{ serverId: string; name: string }`
- `PUT /api/categories` renames or reorders a category.
    - Body: `{ categoryId: string; name?: string; position?: number }`
- `DELETE /api/categories?categoryId=` deletes a category and returns its channels to uncategorized.
- `GET /api/channel-permissions?channelId=` lists permission overrides.
- `POST|PUT /api/channel-permissions` creates or updates an override.
- `DELETE /api/channel-permissions?overrideId=` removes an override.
- `GET /api/channels/{channelId}/pins` returns pinned channel messages.
- `POST /api/channels/{channelId}/mute` mutes a channel for the current user.

## Channel Messages

- `POST /api/messages` creates a channel message.
    - Body:
        ```json
        {
            "channelId": "string",
            "text": "string",
            "serverId": "string",
            "imageFileId": "string",
            "imageUrl": "https://...",
            "replyToId": "string",
            "mentions": ["string"],
            "attachments": []
        }
        ```
    - `channelId` is required.
    - The handler accepts text, image, reply, mention, and attachment combinations, but poll-style messages and attachments have special validation.
- `PATCH /api/messages` edits a channel message.
    - Body: `{ messageId: string; text?: string }`
- `DELETE /api/messages?messageId=` deletes a channel message.
- `GET /api/messages/{messageId}/thread` lists thread messages for a channel message.
- `POST /api/messages/{messageId}/thread` creates a thread reply.
    - Body: `{ text?: string; attachments?: FileAttachment[] }`
- `POST /api/messages/{messageId}/reactions` adds or updates a reaction.
    - Body: `{ emoji: string; emojiId?: string }`
- `DELETE /api/messages/{messageId}/reactions?emoji=` removes a reaction.
- `POST /api/messages/{messageId}/pin` pins a message.
- `DELETE /api/messages/{messageId}/pin` unpins a message.
- `POST /api/messages/{messageId}/poll-votes` records a poll vote.
- `POST /api/messages/{messageId}/poll/close` closes a poll.

## Direct Messages

- `GET /api/direct-messages` is a multiplexed read endpoint.
    - `type=conversations` lists conversations.
    - `type=conversation` fetches or creates a conversation between users.
    - `type=messages` lists messages in a conversation.
    - Query helpers include `conversationId`, `userId1`, and `userId2`.
- `POST /api/direct-messages` creates a direct message or conversation.
    - The body is intentionally permissive and context-dependent.
    - Treat it as an overloaded write endpoint rather than a single fixed schema.
- `PATCH /api/direct-messages` edits a direct message.
    - Body: `{ messageId: string; text?: string }`
- `DELETE /api/direct-messages?messageId=` deletes a direct message.
- `GET /api/direct-messages/{messageId}/thread` lists thread messages for a direct message.
- `POST /api/direct-messages/{messageId}/thread` creates a direct-message thread reply.
- `POST /api/direct-messages/{messageId}/reactions` adds or updates a reaction on a direct message.
- `DELETE /api/direct-messages/{messageId}/reactions?emoji=` removes a reaction from a direct message.
- `POST /api/direct-messages/{messageId}/pin` pins a direct message.
- `DELETE /api/direct-messages/{messageId}/pin` unpins a direct message.
- `GET /api/conversations/{conversationId}/pins` lists pinned direct messages for a conversation.
- `POST /api/conversations/{conversationId}/mute` mutes a conversation for the current user.

## Presence, Status, And Typing

- `POST /api/typing` creates or updates typing state.
    - Body: `{ channelId?: string; conversationId?: string; userName?: string }`
- `DELETE /api/typing?channelId=&conversationId=` clears typing state.
- `GET|POST|PATCH|DELETE /api/status` manages a status document.
    - `GET` can fetch by `userId` or batch by `userIds`.
    - `POST` writes a full status document.
    - `PATCH` performs partial updates.
    - `DELETE` removes a status record for a `userId`.
- `POST /api/status/batch` fetches status for multiple users.
    - Body: `{ userIds: string[] }`

## Inbox And Read State

- `GET /api/inbox` returns unified unread data.
    - Query: `kind=mention,thread`, `scope=all|direct|server`, `limit`, `contextId`, `contextKind`.
    - If `contextId` and `contextKind` are both present, the response is context-scoped.
- `PATCH /api/inbox` marks inbox items or whole contexts as read.
    - Body variant 1: `{ itemIds: string[] }`
    - Body variant 2: `{ action: "mark-all-read"; contextId?: string; contextKind?: "channel" | "conversation" }`
- `GET /api/inbox/digest` returns a scoped unread digest.
- `GET /api/thread-reads?contextId=&contextKind=` returns persisted thread read state.
- `PATCH /api/thread-reads` persists thread read state.
    - Body: `{ contextId: string; contextKind: "channel" | "conversation"; reads: Record<string, string> }`
- `GET /api/memberships` returns the current user's memberships.
- `GET /api/notifications/settings` returns notification settings for the current user.
- `PATCH /api/notifications/settings` updates notification settings.
    - Body fields include `globalNotifications`, `directMessagePrivacy`, `dmEncryptionEnabled`, `desktopNotifications`, `pushNotifications`, `notificationSound`, `quietHoursStart`, `quietHoursEnd`, `quietHoursTimezone`, `serverOverrides`, `channelOverrides`, and `conversationOverrides`.

## Search, Profiles, And Social

- `GET /api/search/messages` searches messages.
- `GET /api/users/search` searches users for discovery or mention autocomplete.
    - The current handler uses the `q` query parameter even though older docs may mention `query`.
- `GET /api/profile/{userId}` returns profile data by user ID.
- `GET /api/users/{userId}/profile` returns the enriched profile view.
- `POST /api/profiles/batch` resolves many profiles at once.
    - Body: `{ userIds: string[] }`
- `GET /api/users/{userId}/relationship` returns relationship state.
- `POST /api/users/{userId}/block` blocks a user.
- `DELETE /api/users/{userId}/block` unblocks a user.
- `GET /api/users/blocked` lists blocked users.
- `GET|POST /api/friends` and `POST /api/friends/request`, `POST /api/friends/{userId}/accept`, `POST /api/friends/{userId}/decline`, `DELETE /api/friends/{userId}` support the friend workflow.

## Invites And Discovery

- `GET /api/invites/{code}` returns a public invite preview.
- `POST /api/invites/{code}/join` redeems an invite and joins the server.
- `DELETE /api/invites/{code}` revokes an invite.
- `GET /api/servers/public` is the public discovery entry point.
- `GET /api/servers/default-signup` is the admin selector for signup defaults.

## Uploads And Assets

- `POST /api/upload-image` uploads an image and returns `{ fileId, fileUrl }`.
- `DELETE /api/upload-image?fileId=` deletes an uploaded image.
- `POST /api/upload-file` uploads a generic attachment and returns `fileId`, `fileName`, `fileSize`, `fileType`, `fileUrl`, `downloadUrl`, and a derived `category`.
- `DELETE /api/upload-file?fileId=` deletes an uploaded attachment.
- `POST /api/upload-emoji` uploads a custom emoji asset.
- `DELETE /api/upload-emoji?fileId=` deletes a custom emoji asset.
- `GET /api/emoji/{fileId}` retrieves an emoji asset through the proxy.
- `GET /api/custom-emojis` lists custom emojis.
- `GET /api/gifs/search` and `GET /api/stickers` power rich media pickers.

## Route Notes For Mobile Implementers

- Prefer server responses over client inference when unread, permission, or membership state is ambiguous.
- Treat partial and nullable profile data as normal, not as an error.
- Do not invent new request fields for message, invite, or notification flows unless the handler already accepts them.
- Reuse the same deep-link identifiers across search results, pinned messages, and thread navigation.
- Ignore debug and test routes like `/api/debug/*`, `/api/test-env`, and `/api/example-newrelic` for mobile parity work.
