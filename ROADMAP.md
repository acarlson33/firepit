# Firepit Development Roadmap

> Last Updated: November 14, 2025

This roadmap outlines the planned features and improvements for Firepit, prioritized by impact and complexity.

## 🎯 High Priority Features (Core Functionality)

### 1. Message Reactions ✅ **[COMPLETED - Q4 2025]**

**Goal:** Allow users to react to messages with emoji, similar to Discord/Slack.

**Technical Requirements:**

-   Add `reactions` array to Message type: `{ emoji: string, userId: string, count: number }[]`
-   Create Appwrite collection attribute or embed in message documents
-   Build reaction picker UI component (reuse EmojiPicker)
-   Implement real-time reaction updates via Appwrite subscriptions
-   Add reaction hover tooltips showing who reacted
-   Support both standard and custom emoji reactions

**Database Changes:**

```typescript
// Add to Message type
reactions?: Array<{
  emoji: string;      // Emoji character or custom emoji ID
  userIds: string[];  // Array of user IDs who used this reaction
  count: number;      // Total count for this emoji
}>;
```

**API Endpoints:**

-   `POST /api/messages/[messageId]/reactions` - Add reaction
-   `DELETE /api/messages/[messageId]/reactions` - Remove reaction
-   Real-time: Subscribe to message updates for reaction changes

**UI Components:**

-   `ReactionButton.tsx` - Display existing reactions with counts
-   `ReactionPicker.tsx` - Emoji picker for adding reactions
-   `ReactionTooltip.tsx` - Show users who reacted

**Estimated Effort:** 2-3 weeks

**Status:** ✅ Complete - Reactions implemented for both channel messages and DMs with custom emoji support.

---

### 2. @Mentions for Users ✅ **[COMPLETED - Q4 2025]**

**Goal:** Enable @username mentions in messages with autocomplete and highlighting.

**Technical Requirements:**

-   Implement mention parsing in message text (detect `@username` pattern)
-   Add `mentions` array to Message type: `string[]` (usernames)
-   Create mention autocomplete UI with user search
-   Highlight mentioned users in message display
-   Store mentions in database for future notification system

**Database Changes:**

```typescript
// Add to Message and DirectMessage types
mentions?: string[];  // Array of mentioned usernames

// Database: Added string array attribute to both collections
```

**API Endpoints:**

-   `GET /api/users/search?q=username` - User autocomplete (existing)
-   `POST /api/messages` - Accepts mentions array (updated)
-   `POST /api/direct-messages` - Accepts mentions array (updated)

**UI Components:**

-   `MentionAutocomplete.tsx` - Dropdown for @mention suggestions ✅
-   `MessageWithMentions.tsx` - Styled mention display in messages ✅
-   `ChatInput.tsx` - Input with mention detection and autocomplete ✅

**Implementation Notes:**

-   Mentions parsed during message send using regex `/@([a-zA-Z][a-zA-Z0-9_-]*)/g`
-   Autocomplete appears when typing @ followed by characters
-   Keyboard navigation (Arrow keys, Enter, Escape) in autocomplete
-   Current user's mentions highlighted differently
-   Works in both channel messages and DMs
-   Future: Notification system for mentioned users

**Status:** ✅ Complete - Full @mention support implemented with autocomplete, highlighting, and database persistence. Notification system can be added as future enhancement.

---

### 3. Per-Server Roles & Permissions ✅ **[COMPLETED - Q4 2025]**

**Goal:** Implement server-specific role hierarchies and channel permissions.

**Technical Requirements:**

-   Create `roles` collection with server-specific roles ✅
-   Add permission system (read, write, manage channels, manage roles, etc.) ✅
-   Implement role assignment UI in server settings ✅
-   Add channel-specific permission overrides ✅
-   Build role management dashboard ✅

**Database Schema:**

```typescript
type Role = {
    $id: string;
    serverId: string;
    name: string;
    color: string; // Hex color for role display
    position: number; // Hierarchy position (higher = more powerful)
    // Permission flags
    readMessages: boolean;
    sendMessages: boolean;
    manageMessages: boolean; // Delete others' messages
    manageChannels: boolean;
    manageRoles: boolean;
    manageServer: boolean;
    mentionEveryone: boolean;
    administrator: boolean; // Bypass all permissions
    mentionable: boolean;
    memberCount?: number;
    $createdAt: string;
};

type RoleAssignment = {
    $id: string;
    userId: string;
    serverId: string;
    roleIds: string[]; // User can have multiple roles
    $createdAt: string;
};

type ChannelPermissionOverride = {
    $id: string;
    channelId: string;
    roleId?: string; // For role overrides
    userId?: string; // For user-specific overrides
    allow: Permission[]; // Array of allowed permission keys
    deny: Permission[]; // Array of denied permission keys (takes precedence)
};
```

**API Endpoints:**

-   `GET /api/roles?serverId=xxx` - List roles ✅
-   `POST /api/roles` - Create role ✅
-   `PUT /api/roles` - Update role ✅
-   `DELETE /api/roles?roleId=xxx` - Delete role ✅

**UI Components:**

-   `RoleList.tsx` - Display roles with hierarchy ✅
-   `RoleEditor.tsx` - Create/edit role with permissions ✅
-   `RoleSettingsDialog.tsx` - Main settings modal ✅
-   Settings button in server header (gear icon) ✅

**Permission System:**

-   `lib/permissions.ts` - Permission calculation utilities ✅
-   Hierarchy: Administrator > User overrides > Role overrides > Base permissions ✅
-   8 permission types: readMessages, sendMessages, manageMessages, manageChannels, manageRoles, manageServer, mentionEveryone, administrator ✅
-   Color-coded roles with position-based hierarchy ✅

**Implementation Notes:**

-   Database collections created with proper indexes ✅
-   TypeScript types added to `lib/types.ts` ✅
-   Permission utilities handle role hierarchy and overrides ✅
-   UI integrated into chat page (Settings button for server owners) ✅
-   Role editor supports all permission flags with descriptions ✅
-   Roles display with color indicators and member counts ✅
-   Member role assignment UI complete ✅
-   Channel permission override editor complete ✅
-   Full API implementation with proper validation ✅

**Future Enhancements:**

-   Role mention system (@role mentions in messages)
-   Automatic default role assignment for new members
-   Role templates/presets (Moderator, Member, etc.)
-   Role hierarchy drag-and-drop reordering
-   Role audit logging

**Status:** ✅ Complete - Full role and permission system with CRUD operations, permission hierarchy calculation, role assignment UI, channel permission overrides, and comprehensive management interface. Production ready.

**Estimated Effort:** 6-8 weeks (complex feature)

---

### 4. Server Invite System 🎯 **[Q1 2026]**

**Goal:** Generate shareable invite links with expiration and usage limits.

**Technical Requirements:**

-   Create `invites` collection with unique codes
-   Generate short invite codes (e.g., `abc123xyz`)
-   Support expiration times (never, 1h, 6h, 12h, 1d, 7d)
-   Support max uses (unlimited, 1, 5, 10, 25, 50, 100)
-   Track invite usage and who joined via which invite
-   Build invite management UI
-   Create public invite landing page

**Database Schema:**

```typescript
type ServerInvite = {
    $id: string;
    serverId: string;
    code: string; // Unique 8-10 char code
    creatorId: string;
    channelId?: string; // Default channel to show after joining
    expiresAt?: string; // ISO timestamp or null for never
    maxUses?: number; // null for unlimited
    currentUses: number;
    temporary: boolean; // Kick user if they go offline without role
    $createdAt: string;
};

type InviteUsage = {
    $id: string;
    inviteCode: string;
    userId: string;
    serverId: string;
    joinedAt: string;
};
```

**API Endpoints:**

-   `POST /api/servers/[serverId]/invites` - Create invite
-   `GET /api/servers/[serverId]/invites` - List server invites
-   `DELETE /api/invites/[code]` - Revoke invite
-   `GET /api/invites/[code]` - Get invite details (public)
-   `POST /api/invites/[code]/join` - Join server via invite

**UI Components:**

-   `InviteManager.tsx` - List and manage invites in server settings
-   `CreateInviteDialog.tsx` - Modal for creating new invites
-   `InviteLandingPage.tsx` - Public page showing server preview
-   `InviteButton.tsx` - Copy invite link button
-   `InviteStatsCard.tsx` - Show invite usage stats

**Routes:**

-   `/invite/[code]` - Public invite landing page
-   `/chat?server=[serverId]&invite=[code]` - Auto-join on authenticated users

**Estimated Effort:** 3-4 weeks

---

### 5. Message Search ✅ **[COMPLETED - Q4 2025]**

**Goal:** Full-text search across all messages in channels and DMs.

**Technical Requirements:**

-   Implement full-text search using Appwrite's full-text index ✅
-   Create search UI with filters (user, channel, date range, has:image, mentions:me) ✅
-   Build search results view with message previews ✅
-   Support jump-to-message functionality ✅
-   Add keyboard shortcut (Ctrl/Cmd + K) ✅
-   Implement search history (pending enhancement)

**Database Changes:**

```typescript
// Full-text index added to messages collection on 'text' field ✅
// Appwrite native search support implemented ✅
```

**API Endpoints:**

-   `GET /api/search/messages?q=query&channel=&user=&from=&to=` - Search messages ✅

**UI Components:**

-   `GlobalSearch.tsx` - Main search dialog (Ctrl+K) ✅
-   `SearchResults.tsx` - Results list with previews ✅
-   Search input with real-time results ✅

**Search Features:**

-   Text matching (case-insensitive) ✅
-   Filter by:
    -   `from:@username` - Messages from specific user ✅
    -   `in:#channel` - Messages in specific channel ✅
    -   `has:image` - Messages with images ✅
    -   `mentions:me` - Messages that mention you ✅
    -   `before:YYYY-MM-DD` - Date filters ✅
    -   `after:YYYY-MM-DD` - Date filters ✅
-   Keyboard navigation ✅
-   Result highlighting ✅
-   Search across both channel messages and DMs ✅
-   Profile enrichment in search results ✅
-   Limit to 50 results for performance ✅

**Implementation Notes:**

-   Full-text search powered by Appwrite's native search
-   Advanced filter parsing from query string
-   Combined results from channels and DMs sorted by date
-   Profile data enriched with avatars and display names
-   Keyboard shortcut (Ctrl/Cmd + K) opens search dialog
-   Real-time search as you type
-   Clean, responsive UI

**Status:** ✅ Complete - Full message search with advanced filters, keyboard shortcuts, and rich results display.

**Estimated Effort:** 4-5 weeks

---

### 6. File Attachments (Beyond Images) ✅ **[COMPLETED - Q4 2025]**

**Goal:** Support uploading and sharing various file types (PDFs, documents, videos, audio).

**Technical Requirements:**

-   Extend Appwrite storage bucket to support more file types ✅
-   Add file type validation and size limits per type ✅
-   Create file preview components (PDF viewer, video player, audio player) ✅
-   Add download functionality with virus scanning (optional) ✅
-   Implement file metadata display (size, type, name) ✅
-   Support multiple files per message ✅

**Database Changes:**

```typescript
// Extend Message type
attachments?: Array<{
  fileId: string;
  fileName: string;
  fileSize: number;       // Bytes
  fileType: string;       // MIME type
  fileUrl: string;
  thumbnailUrl?: string;  // For videos
}>;
```

**File Type Support:**

-   **Documents:** PDF, DOCX, XLSX, PPTX, TXT (max 10MB) ✅
-   **Images:** JPG, PNG, GIF, WebP, SVG (max 5MB) ✅
-   **Videos:** MP4, WebM, MOV, AVI, MKV (max 50MB) ✅
-   **Audio:** MP3, WAV, OGG, M4A, FLAC (max 10MB) ✅
-   **Archives:** ZIP, RAR, 7Z, TAR, GZIP (max 25MB) ✅
-   **Code:** JS, TS, PY, JSON, etc. with syntax highlighting (max 1MB) ✅

**API Endpoints:**

-   `POST /api/upload-file` - Upload file (chunked for large files) ✅
-   File download via direct Appwrite storage URLs ✅

**UI Components:**

-   `FileUploadButton.tsx` - Multi-file upload ✅
-   `FileAttachmentDisplay.tsx` - Generic file preview dispatcher ✅
-   `FileIcon.tsx` - File type icons ✅
-   Inline video/audio players ✅
-   `FileDropZone.tsx` - Drag and drop support ✅

**Security:**

-   Validate MIME types server-side ✅
-   File size limits enforced per category ✅
-   Rate limit uploads per user ✅
-   Content-Security-Policy headers ✅

**Implementation Notes:**

-   Full file type validation with category-based limits
-   Inline preview for images, videos, and audio
-   Download links for documents and archives
-   File metadata display (name, size, type)
-   Integrated into both channel messages and DMs
-   FileAttachment type includes fileId, fileName, fileSize, fileType, fileUrl, thumbnailUrl

**Status:** ✅ Complete - Comprehensive file attachment system supporting all major file types with proper validation, size limits, and preview capabilities.

**Estimated Effort:** 5-6 weeks

---

## 📊 Medium Priority Features (UX Improvements)

### 7. Message Threads 📊 **[Q2 2026]**

**Goal:** Create threaded conversations from any message.

**Technical Requirements:**

-   Add `threadId` reference to messages
-   Create thread view UI (side panel)
-   Show thread indicators on parent messages
-   Support notifications for thread replies
-   Display thread participant count

**Database Changes:**

```typescript
// Add to Message type
threadId?: string;        // Parent message ID if this is a thread reply
threadMessageCount?: number;  // Count of replies (on parent message)
threadParticipants?: string[]; // User IDs who replied in thread
lastThreadReplyAt?: string;
```

**API Endpoints:**

-   `GET /api/messages/[messageId]/thread` - Get thread replies
-   `POST /api/messages/[messageId]/thread` - Reply to thread
-   Real-time: Subscribe to thread updates

**UI Components:**

-   `ThreadPanel.tsx` - Side panel showing thread
-   `ThreadIndicator.tsx` - Badge on parent message showing reply count
-   `StartThreadButton.tsx` - Action to start thread
-   `ThreadNotification.tsx` - Thread reply notifications

**Estimated Effort:** 4-5 weeks

---

### 8. Message Pinning 📊 **[Q2 2026]**

**Goal:** Pin important messages to the top of channels.

**Technical Requirements:**

-   Add `pinned` collection or boolean flag on messages
-   Limit pinned messages per channel (e.g., 50 max)
-   Create pinned messages view
-   Require "Manage Messages" permission
-   Add pin/unpin notifications to channel

**Database Changes:**

```typescript
// Option 1: Add to Message type
pinned?: boolean;
pinnedAt?: string;
pinnedBy?: string;  // User ID who pinned it

// Option 2: Separate collection (better for limits)
type PinnedMessage = {
  $id: string;
  channelId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
};
```

**API Endpoints:**

-   `POST /api/messages/[messageId]/pin` - Pin message
-   `DELETE /api/messages/[messageId]/pin` - Unpin message
-   `GET /api/channels/[channelId]/pins` - List pinned messages

**UI Components:**

-   `PinnedMessagesPanel.tsx` - View all pinned messages
-   `PinButton.tsx` - Pin/unpin action in message menu
-   `PinnedBanner.tsx` - Show newest pinned message at top

**Estimated Effort:** 2-3 weeks

---

### 9. Channel Categories 📊 **[Q2 2026]**

**Goal:** Organize channels into collapsible categories.

**Technical Requirements:**

-   Create `categories` collection
-   Add `categoryId` to channels
-   Implement drag-and-drop reordering
-   Support collapse/expand state per user
-   Add category permissions

**Database Schema:**

```typescript
type ChannelCategory = {
  $id: string;
  serverId: string;
  name: string;
  position: number;       // Display order
  $createdAt: string;
};

// Add to Channel type
categoryId?: string;
position: number;         // Position within category
```

**API Endpoints:**

-   `GET /api/servers/[serverId]/categories` - List categories
-   `POST /api/servers/[serverId]/categories` - Create category
-   `PATCH /api/categories/[categoryId]` - Update category
-   `DELETE /api/categories/[categoryId]` - Delete category
-   `PATCH /api/channels/[channelId]/move` - Move to category/reorder

**UI Components:**

-   `ChannelCategory.tsx` - Collapsible category container
-   `CategoryManager.tsx` - Server settings for categories
-   `CategoryDragHandle.tsx` - Drag-to-reorder

**Estimated Effort:** 3-4 weeks

---

### 10. Friend System & Blocking 📊 **[Q3 2026]**

**Goal:** Add friend requests, friend lists, and user blocking.

**Technical Requirements:**

-   Create `friendships` and `blocks` collections
-   Implement friend request workflow (pending/accepted/declined)
-   Add friends list view
-   Support blocking users (hide messages, prevent DMs)
-   Add friend-only DM option

**Database Schema:**

```typescript
type Friendship = {
    $id: string;
    userId1: string; // Requester
    userId2: string; // Recipient
    status: "pending" | "accepted" | "declined";
    requestedAt: string;
    acceptedAt?: string;
};

type BlockedUser = {
    $id: string;
    userId: string; // Who blocked
    blockedUserId: string; // Who is blocked
    blockedAt: string;
};
```

**API Endpoints:**

-   `POST /api/friends/request` - Send friend request
-   `POST /api/friends/[userId]/accept` - Accept request
-   `POST /api/friends/[userId]/decline` - Decline request
-   `DELETE /api/friends/[userId]` - Remove friend
-   `GET /api/friends` - List friends
-   `POST /api/users/[userId]/block` - Block user
-   `DELETE /api/users/[userId]/block` - Unblock user
-   `GET /api/users/blocked` - List blocked users

**UI Components:**

-   `FriendsList.tsx` - Friends view with status
-   `FriendRequest.tsx` - Pending requests UI
-   `AddFriendDialog.tsx` - Send friend request
-   `BlockUserButton.tsx` - Block/unblock action
-   `BlockedUsersSettings.tsx` - Manage blocked users

**Message Filtering:**

-   Hide messages from blocked users
-   Prevent DMs from blocked users
-   Don't show blocked users in search

**Estimated Effort:** 5-6 weeks

---

### 11. Better Notification Controls 📊 **[Q3 2026]**

**Goal:** Granular notification settings per channel, server, and user.

**Technical Requirements:**

-   Create user preferences collection
-   Support notification levels: All, Mentions Only, Nothing
-   Add mute duration options (15m, 1h, 8h, 24h, until unmuted)
-   Implement @mention sound/visual customization
-   Add desktop/push notification settings
-   Support notification schedules (quiet hours)

**Database Schema:**

```typescript
type NotificationSettings = {
    $id: string;
    userId: string;

    // Global settings
    globalNotifications: "all" | "mentions" | "nothing";
    desktopNotifications: boolean;
    pushNotifications: boolean;
    notificationSound: boolean;
    quietHoursStart?: string; // HH:mm format
    quietHoursEnd?: string;

    // Per-server overrides
    serverOverrides?: Record<
        string,
        {
            level: "all" | "mentions" | "nothing";
            mutedUntil?: string; // ISO timestamp
        }
    >;

    // Per-channel overrides
    channelOverrides?: Record<
        string,
        {
            level: "all" | "mentions" | "nothing";
            mutedUntil?: string;
        }
    >;

    // Per-conversation overrides
    conversationOverrides?: Record<
        string,
        {
            level: "all" | "mentions" | "nothing";
            mutedUntil?: string;
        }
    >;
};
```

**API Endpoints:**

-   `GET /api/users/notifications/settings` - Get settings
-   `PATCH /api/users/notifications/settings` - Update settings
-   `POST /api/channels/[channelId]/mute` - Mute channel
-   `POST /api/servers/[serverId]/mute` - Mute server

**UI Components:**

-   `NotificationSettings.tsx` - Settings page
-   `MuteDialog.tsx` - Mute duration selector
-   `NotificationBadge.tsx` - Unread indicators
-   `QuietHoursSettings.tsx` - Schedule configuration
-   `ChannelMuteButton.tsx` - Quick mute toggle

**Notification Priority:**

1. Channel override (most specific)
2. Server override
3. Global setting (fallback)

**Estimated Effort:** 4-5 weeks

---

### 12. User Kick/Ban/Timeout ✅ **[COMPLETED - Q1 2026]**

**Goal:** Comprehensive moderation tools for server management.

**Technical Requirements:**

-   Create `bans` and `timeouts` collections
-   Implement kick (remove from server)
-   Implement ban (permanent removal + block rejoin)
-   Implement timeout (temporary mute with duration)
-   Add ban/timeout reason and audit trail
-   Support unban functionality
-   Display banned users list

**Database Schema:**

```typescript
type ServerBan = {
    $id: string;
    serverId: string;
    userId: string;
    bannedBy: string;
    reason?: string;
    bannedAt: string;
    expiresAt?: string; // For temporary bans
};

type ServerTimeout = {
    $id: string;
    serverId: string;
    userId: string;
    timeoutBy: string;
    reason?: string;
    timeoutUntil: string; // ISO timestamp
    createdAt: string;
};

type ServerKick = {
    $id: string;
    serverId: string;
    userId: string;
    kickedBy: string;
    reason?: string;
    kickedAt: string;
};
```

**API Endpoints:**

-   `POST /api/servers/[serverId]/members/[userId]/kick` - Kick user
-   `POST /api/servers/[serverId]/members/[userId]/ban` - Ban user
-   `DELETE /api/servers/[serverId]/bans/[userId]` - Unban user
-   `POST /api/servers/[serverId]/members/[userId]/timeout` - Timeout user
-   `GET /api/servers/[serverId]/bans` - List banned users
-   `GET /api/servers/[serverId]/audit` - Moderation audit log

**UI Components:**

-   `ModerationMenu.tsx` - User context menu with moderation actions
-   `BanDialog.tsx` - Ban user with reason input
-   `TimeoutDialog.tsx` - Timeout duration selector
-   `BannedUsersList.tsx` - Server settings page for bans
-   `ModerationAuditLog.tsx` - Server-specific audit trail

**Permission Checks:**

-   Kick Members permission required for kicks
-   Ban Members permission required for bans
-   Moderate Members permission required for timeouts
-   Cannot moderate users with equal/higher roles

**Message Handling:**

-   Kicked users can see messages but not send
-   Timed out users can see but not send (temporary)
-   Banned users lose all access

**Estimated Effort:** 5-6 weeks

---

### 13. User Server Creation with Feature Flags ✅ **[COMPLETED - Q1 2026]**

**Goal:** Allow regular users to create their own servers when enabled by administrators through a feature flag system.

**Technical Requirements:**

-   Implement extensible feature flag system in database
-   Create admin panel UI for managing feature flags
-   Add `ALLOW_USER_SERVERS` feature flag (default: disabled)
-   Build "Create Server" dialog for users
-   Add API endpoint for server creation with feature flag check
-   Integrate Create Server button into chat UI (conditional rendering)

**Database Schema:**

```typescript
type FeatureFlag = {
    $id: string;
    key: string; // e.g., "allow_user_servers"
    enabled: boolean;
    description?: string;
    updatedAt: string;
    updatedBy: string; // Admin who last changed it
};
```

**Feature Flag System:**

-   Centralized feature flag management in `/src/lib/feature-flags.ts`
-   Server-side checks prevent bypass attempts
-   1-minute cache to reduce database calls
-   Admin override: always allow admin server creation
-   Test bypass: `bypassFeatureCheck: true` in tests

**API Endpoints:**

-   `GET /api/feature-flags/allow-user-servers` - Check if feature is enabled
-   `POST /api/servers/create` - Create server (checks feature flag)
-   Admin actions in `/src/app/admin/actions.ts` for flag management

**UI Components:**

-   `CreateServerDialog.tsx` - User-facing server creation dialog ✅
-   `FeatureFlags.tsx` - Admin panel section for managing flags ✅
-   Integration in `/src/app/chat/page.tsx` - Conditional Create Server button ✅

**Server Creation Flow:**

1. User clicks "+" button (only visible if feature enabled)
2. Dialog opens with server name input
3. API validates and creates server with:
    - User as owner
    - Automatic membership creation
    - Default "general" channel
    - Initial member count of 1
4. Server list refreshes automatically

**Permission Model:**

-   Regular users: Can only create if `ALLOW_USER_SERVERS` is enabled
-   Admins: Can always create servers (bypass feature flag)
-   Tests: Use `bypassFeatureCheck: true` to avoid dependencies

**Admin Controls:**

-   Toggle feature flag via Admin Panel at `/admin`
-   Changes take effect immediately for all users
-   Feature state cached for 1 minute for performance

**Documentation:**

-   Complete guide in `/docs/USER_SERVER_CREATION.md`
-   Includes setup, usage, and security details

**Status:** ✅ Complete - Full feature flag system implemented with admin controls, user server creation dialog, and comprehensive error handling. Feature can be enabled/disabled dynamically by administrators.

---

## 📅 Implementation Timeline

### Q4 2025 (Oct - Dec)

-   ✅ Message Reactions
-   ✅ @Mentions for Users

### Q1 2026 (Jan - Mar)

-   ✅ Per-Server Roles & Permissions (COMPLETED October 2025)
-   ✅ User Kick/Ban/Timeout (COMPLETED October 2025 - moved from Q3)
-   ✅ Message Search (COMPLETED January 2026)
-   ✅ File Attachments (Beyond Images) (COMPLETED January 2026)
-   🎯 Server Invite System (NEXT PRIORITY)

### Q2 2026 (Apr - Jun)

-   🎯 Message Threads
-   🎯 Message Pinning
-   🎯 Channel Categories

### Q3 2026 (Jul - Sep)

-   🎯 Friend System & Blocking
-   🎯 Better Notification Controls
-   ✅ User Kick/Ban/Timeout (Completed early in Q1 2026)

---

## 🎯 Success Metrics

### Feature Adoption

-   **Reactions:** % of messages with reactions, avg reactions per message
-   **Mentions:** Mention usage rate, notification engagement
-   **Roles:** % of servers using custom roles, avg roles per server
-   **Search:** Search queries per user per week ✅
-   **File Attachments:** File upload rate, file types distribution ✅
-   **Invites:** Invite creation rate, join rate via invites (pending)

### User Engagement

-   Daily Active Users (DAU)
-   Messages per user per day
-   Server creation rate
-   User retention (D1, D7, D30)

### Performance

-   Message send latency (target: <100ms)
-   Search query latency (target: <500ms)
-   File upload success rate (target: >99%)
-   Real-time update latency (target: <200ms)

---

## 🔄 Ongoing Initiatives

### Technical Debt & Infrastructure

-   [ ] Migrate to Appwrite 1.5+ features
-   [ ] Implement comprehensive rate limiting
-   [ ] Add CDN for file serving
-   [ ] Optimize database indexes
-   [ ] Add Redis caching layer (optional)
-   [ ] Improve test coverage (target: 90%+)

### Documentation

-   [ ] API documentation with examples
-   [ ] User guides for each feature
-   [ ] Admin/moderator handbook
-   [ ] Self-hosting guide improvements
-   [ ] Video tutorials

### Developer Experience

-   [ ] Storybook for component library
-   [ ] E2E testing with Playwright
-   [ ] CI/CD improvements
-   [ ] Development environment containerization

---

## 📝 Notes

### Design Principles

1. **Keep it simple** - Don't overcomplicate Discord features
2. **Privacy first** - User data control and transparency
3. **Performance matters** - Fast, responsive, real-time
4. **Accessibility** - WCAG 2.1 AA compliance minimum
5. **Mobile-friendly** - PWA must work great on mobile

### Feature Flags

All new features should be:

-   Behind feature flags for gradual rollout
-   Tested with canary users first
-   Monitored with New Relic for performance impact
-   Documented before release

### Community Input

-   Gather feedback on Discord/GitHub discussions
-   Run user surveys quarterly
-   Beta test with select communities
-   Public roadmap voting system (future)

---

## 🚀 How to Contribute

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

-   Development setup
-   Coding standards
-   Pull request process
-   Feature proposal guidelines

For questions or suggestions, open a GitHub Discussion or issue.

---

**Last Updated:** January 14, 2026  
**Maintained by:** Firepit Core Team
