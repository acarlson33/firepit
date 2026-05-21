# Firepit Mobile Feature Parity Backlog

This is the mobile backlog derived from the current web app. The intent is to preserve feature parity with the web product so the mobile client can act like a first-class Firepit client.

## Core Communication

- Real-time channel messaging with create, edit, delete, reply, mention, reaction, pin, and thread support.
- Direct messages with 1:1 and group conversation support.
- Threaded replies in both channels and direct messages.
- Message search with deep links back into the correct channel or conversation.
- Typing indicators and presence updates.

## Authentication And Onboarding

- Session bootstrap and current-user loading.
- Onboarding flow for new accounts.
- Display name, username, avatar, pronouns, and bio setup.
- Invite-based first-join flows.
- Public server discovery and direct server join.

## Servers And Discovery

- Server list and server switching.
- Public server discovery.
- Create server flow.
- Server settings editing for name, description, visibility, and icon/banner.
- Default-signup server handling for instance admins.
- Server stats and member list views.

## Channel Organization

- Channel categories.
- Text, voice, and announcement channel types.
- Channel creation, rename, move, and delete.
- Channel mute controls.
- Channel permission overrides.
- Pinned channel messages.

## Direct Message Experience

- DM conversation list.
- New DM and conversation creation.
- DM threads.
- DM reactions.
- DM pins.
- Conversation mute controls.

## Social And Identity

- User profile viewing.
- Enriched profile cards with avatars, pronouns, bios, backgrounds, and avatar frames.
- People search and mention autocomplete.
- Friend requests, accepts, declines, and removal.
- User blocking and blocked-user list handling.
- Relationship state display in profile and DM contexts.

## Notifications And Read State

- Unified inbox for mentions and thread unread items.
- Jump-to-unread behavior in channels and conversations.
- Mark-all-read and per-item read actions.
- Persistent thread-read state.
- Notification settings, including global level, DM privacy, quiet hours, and overrides.
- Mute state for servers, channels, and conversations.

## Media And Rich Content

- Image uploads.
- Generic file uploads.
- Custom emoji uploads and custom emoji browsing.
- GIF search.
- Sticker browsing.
- Poll messages and poll voting.

## Moderation And Admin

- Server invite management.
- Invite preview and invite redemption.
- Server member management.
- Role creation, editing, assignment, and removal.
- Channel permission override management.
- Server moderation actions: ban, unban, mute, unmute, and kick.
- Audit log review and export.

## Settings And Utility

- User notification settings.
- Web-shell style navigation preferences where they apply to mobile equivalents.
- Version and instance metadata screens if needed for diagnostics.
- Feature-flag-aware rendering for user-created server support.

## Web-Parity Features That Matter On Mobile

- Pinned-message jump flows.
- Search-result jump flows.
- Realtime corrections for message and unread state.
- Permission-aware hiding of actions.
- Feature-flag-aware hiding of unavailable entry points.

## Lower Priority But Still In The Web App

- Admin server list and default-signup tooling.
- Profile debug and telemetry debugging views.
- API and documentation helper pages.
