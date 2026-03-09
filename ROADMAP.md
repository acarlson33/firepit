# Firepit Roadmap

> Last Updated: March 9, 2026

This roadmap is now organized around Discord parity areas instead of a historical milestone list. The goal is to make it obvious which Discord-like surfaces already exist in Firepit, which parity gaps are still open, and which areas are intentionally deferred.

For technical implementation planning that follows this roadmap, see [docs/ROADMAP_IMPLEMENTATION_SPEC.md](./docs/ROADMAP_IMPLEMENTATION_SPEC.md).

## Roadmap Rules

- Use this document to track product parity, not to archive release notes.
- Treat the documented product and API surface as the source of truth for live features.
- Keep completed parity areas visible so we do not re-open already solved work.
- Mark long-term Discord features explicitly as planned, investigating, or deferred instead of leaving them untracked.

## Status Legend

- Live: shipped and represented in the current product/docs/API surface
- Planned: approved roadmap work with clear parity value
- Investigating: useful parity area, but scope or priority still needs definition
- Deferred: intentionally not a near-term priority
- Gap: major Discord parity area with little or no implementation today

## Discord Parity Snapshot

| Parity Area                            | Status         | Summary                                                                                                                               |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Server and community layer             | Strong parity  | Servers, channels, categories, invites, discovery, roles, and moderation are live; deeper community-grade organization is still open. |
| Messaging and conversation layer       | Strong parity  | Channels, 1:1 DMs, group DMs, replies, mentions, reactions, threads, pins, search, emoji, and attachments are live.                   |
| Identity, presence, and social graph   | Partial parity | Profiles, statuses, friends, blocking, and onboarding foundations are live; richer identity and social polish are still open.         |
| Notifications and attention management | Partial parity | Settings and mute controls exist, but deeper Discord-style notification control is still incomplete.                                  |
| Moderation and trust/safety            | Strong parity  | Role-aware moderation, audit logs, bans, kicks, and mutes are already part of the server surface.                                     |
| Voice, video, and ecosystem features   | Gap            | No meaningful parity yet for calls, screen share, bots, webhooks, or richer platform integrations.                                    |

## 1. Server And Community Parity

### Live

- Server creation and server listing
- Public server discovery and direct join flows
- Invite creation, preview, redemption, expiry, and usage limits
- Multi-channel server structure
- Channel categories with collapsible organization and explicit ordering controls
- Per-server roles and channel permission overrides
- Server moderation actions with audit logging
- Feature-flagged self-serve server creation for non-admin users

### Planned

- Category-aware permission polish and richer drag-and-drop management
- Role polish that improves parity with Discord server admin workflows:
  role mentions, default role assignment, presets/templates, and clearer hierarchy management
- Better server onboarding flows after invite redemption or discovery joins

### Investigating

- Server templates for repeatable community setup
- Welcome/safety screens for newly joined members
- Announcement-style and community-oriented server surfaces
- Better discovery ranking and server profile presentation

### Deferred

- Full Discord community feature parity such as stage channels, forums, scheduled events, and monetization surfaces

## 2. Messaging And Conversation Parity

### Live

- Channel messaging
- Direct messages and group DMs
- Message replies
- User mentions with autocomplete and highlighting
- Reactions, including custom emoji support
- Message threads in channels and DMs
- Message pinning in channels and DMs
- Rich file attachments beyond images
- Message search across channels and DMs
- Typing indicators across channels and conversations

### Planned

- Close the remaining UX gaps between server chat and DM chat where similar message actions should behave the same way
- Continue improving navigation into search results, pinned items, and thread state so parity holds across all message surfaces
- Add clearer parity tracking for message-history affordances that users expect in Discord-like products

### Investigating

- Polls
- Voice messages
- Message bookmarks or saved items
- Better unread and catch-up flows for high-volume channels

### Deferred

- Voice/video calling and screen sharing

## 3. Identity, Presence, And Social Graph Parity

### Live

- Profiles with avatar, bio, and pronoun support
- Presence and status updates
- User search for mentions and social flows
- Friend requests, friend lists, and blocking
- Onboarding and profile-completion foundations

### Planned

- Friend-only DM controls and other social-boundary settings
- Better onboarding that makes profile setup, first server join, and first conversation start feel closer to a complete Discord-style first-run flow
- Stronger parity between profile data shown in chat, member lists, moderation views, and discovery surfaces

### Investigating

- Mutual server and mutual friend visibility
- Richer member cards and profile popovers
- Linked account and external identity integrations
- Activity-style presence beyond basic status text

### Deferred

- Full Discord-style activity ecosystem and rich third-party presence integrations

## 4. Notifications And Attention Management Parity

### Live

- Notification settings API foundation
- Per-server mute controls
- Per-channel mute controls
- Per-conversation mute controls

### Planned

- Granular notification levels: all, mentions only, nothing
- Mute duration presets and better mute UX
- Quiet hours / notification schedules
- Desktop and push notification preferences
- Sound and visual customization for mention-heavy workflows

### Investigating

- Mention inbox or notification center
- Unread-count consistency across servers, channels, and DMs
- Digest-style summaries for missed activity

### Deferred

- Native mobile notification parity until there is a native mobile app strategy

## 5. Moderation, Safety, And Admin Parity

### Live

- Role-aware permission evaluation
- Kick, ban, unban, mute, and unmute server moderation flows
- Invite management with ownership and admin safeguards
- Audit log viewing and export
- Global admin and moderator support

### Planned

- Better moderator workflows for reviewing banned or muted users
- Cleaner admin surfaces for permissions, audits, and server settings
- Stronger documentation and UX around effective permissions and moderation history

### Investigating

- More complete moderation analytics
- Safer bulk moderation workflows
- Escalation tooling for large public communities

### Deferred

- Enterprise-grade trust and safety operations beyond current community/server needs

## 6. Platform And Ecosystem Parity

### Live

- PWA support
- Real-time subscriptions across major chat surfaces
- Feature flags for controlled rollout

### Planned

- Continue hardening reliability, observability, and performance around realtime chat
- Improve test coverage for parity-critical chat and moderation flows
- Make documentation easier to keep aligned with shipped product behavior

### Investigating

- Webhooks
- Bots and slash-command style integrations
- Public developer platform surface

### Deferred

- Native mobile apps
- Full Discord bot-platform parity

## Near-Term Priorities

### Q2 2026

- Finish the advanced notification-control work so mute and preference behavior is consistent across servers, channels, and DMs
- Continue closing parity gaps where a feature exists in one chat surface but not another
- Continue polishing the newly shipped category-management UX and permissions model

### Q3 2026

- Improve onboarding, discovery, and social graph polish so new-user and returning-user flows are more complete
- Improve moderation and admin workflows for communities that rely on roles, invites, and audit history daily
- Decide whether bots/webhooks belong on the active parity roadmap or should remain deferred

## Long-Term Parity Decisions

These features should remain visible on the roadmap even when we are not actively building them, because users will compare Firepit to Discord in these areas:

- Voice/video calls and screen sharing
- Bots, slash commands, and webhooks
- Forum, stage, and announcement channel types
- Scheduled events and community onboarding tooling
- Native mobile experience beyond PWA support

## Success Metrics

### Product Metrics

- Weekly active servers
- Messages per active user
- DM and group DM adoption
- Invite-to-join conversion rate
- Friend request acceptance rate

### Parity Metrics

- Number of Discord-style feature areas with documented ownership and status
- Number of chat features that behave consistently across channels and DMs
- Notification-setting coverage across server, channel, and conversation scopes
- Moderator task completion time for common admin actions

### Quality Metrics

- Real-time event latency
- Search response time
- Attachment upload success rate
- Error rate in parity-critical APIs and realtime subscriptions

## Maintenance Notes

- Update this roadmap when a parity area changes state, not only when a release ships.
- If a feature is live in docs/API/product, it should appear under a parity area in this document.
- If a Discord-comparison feature is intentionally out of scope, keep it listed as deferred rather than silently dropping it.
