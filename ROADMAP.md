# Firepit Roadmap

> Last Updated: March 15, 2026

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

| Parity Area                            | Status         | Summary                                                                                                                                                       |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server and community layer             | Strong parity  | Servers, channels, categories, invites, discovery, roles, and moderation are live; deeper community-grade organization is still open.                         |
| Messaging and conversation layer       | Strong parity  | Channels, 1:1 DMs, group DMs, replies, mentions, reactions, threads, pins, search, emoji, and attachments are live.                                           |
| Identity, presence, and social graph   | Partial parity | Profiles, statuses, friends, blocking, and onboarding foundations are live; richer identity and social polish are still open.                                 |
| Notifications and attention management | Partial parity | Scoped notification levels, unified inbox and unread controls, mute durations, quiet hours, and per-context controls are live; digest follow-on remains open. |
| Moderation and trust/safety            | Strong parity  | Role-aware moderation, audit logs, bans, kicks, and mutes are already part of the server surface.                                                             |
| Voice, video, and ecosystem features   | Gap            | No meaningful parity yet for calls, screen share, bots, webhooks, or richer platform integrations.                                                            |

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
- Announcement-style and community-oriented server surfaces (Announcement channel types)

### Investigating

- Server templates for repeatable community setup
- Welcome/safety screens for newly joined members
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
- Consistent deep-link navigation from search results, pinned messages, and thread entry points across channel and DM chat
- Unified inbox and mentions surfaces across channel and DM contexts
- Jump-to-unread and catch-up actions shared across channel and DM chat
- Inbox filters for all, mentions, direct messages, and server channels

### Planned

- Add clearer parity tracking for message-history affordances that users expect in Discord-like products
- Digest-style unread summaries and follow-on attention workflows on top of the shipped inbox model

### Investigating

- Polls
- Voice messages
- Message bookmarks or saved items
- Higher-order catch-up and triage workflows for high-volume channels after digest semantics settle

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
- Richer member cards and profile popovers

### Investigating

- Mutual server and mutual friend visibility
- Linked account and external identity integrations
- Activity-style presence beyond basic status text

### Deferred

- Full Discord-style activity ecosystem and rich third-party presence integrations

## 4. Notifications And Attention Management Parity

### Live

- Notification settings API foundation
- Global notification levels: all, mentions only, nothing
- Per-server mute controls
- Per-channel mute controls
- Per-conversation mute controls
- Quiet hours with timezone-aware schedules
- Desktop, push, and sound preferences
- Direct-message privacy controls
- Shared mute-management flows across server, channel, and DM contexts
- Settings UI for scoped override review, label enrichment, search, and bulk cleanup actions
- Unified unread and badge semantics across server list, channel list, conversation list, and inbox
- Context-scoped and global inbox mark-read workflows, including mark-all-read catch-up behavior
- Mentions-only precedence that suppresses thread unread items while preserving mention visibility

### Planned

- Additional polish for high-volume mention workflows and future mobile delivery surfaces

### Investigating

- Digest-style inbox extensions beyond the current thread-and-mention unread model
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

### Version 1.6 Scope (Canary To Stable)

Status: Pre-release. Version 1.6 is finalizing unread and attention-management parity work that started in canary, with release targeted for 2026-04-02.

#### Must Ship

- Per-message unread parity across channels, DMs, and threads, including consistent read cursor behavior after message send, read, and navigation events
- Unified inbox v1 covering unread and mentions across server and DM contexts with stable sorting and clear read-state transitions
- Jump-to-unread and catch-up actions in every major message surface (channel, DM, thread, inbox)
- Unified unread and badge semantics across server list, channel list, conversation list, and inbox
- Mention-workflow controls for high-volume contexts, including per-context mention muting and bulk mark-read actions

All Must Ship items are complete and represented in the current API, docs, and product surfaces.

#### Should Ship

- Better empty, loading, and error states for unread and inbox flows
- Keyboard-first navigation and focus management parity for unread and inbox actions
- Improved diagnostics and analytics for unread mismatches and badge drift

#### Could Ship (If Capacity Allows)

- Digest-style summary experiments for missed activity windows
- Additional onboarding copy that explains unread semantics to new users
- Moderator-facing visibility into unread pressure in high-volume public servers

#### Acceptance Criteria

- Cross-surface consistency: unread state transitions match between channel, DM, thread, and inbox views for equivalent events
- Badge correctness: global and scoped badges match server-side unread totals with no known deterministic drift scenarios
- Jump reliability: jump-to-unread lands on the expected first unread message in parity-critical surfaces
- Catch-up reliability: mark-read and mark-all actions are idempotent and converge quickly under concurrent realtime events
- Mention accuracy: mention-only users are not over-notified by non-mention activity in muted or mentions-only contexts
- Accessibility: unread and inbox controls are keyboard reachable, screen-reader labeled, and do not regress existing a11y baselines
- Performance: no material regression in message-list render or inbox query latency relative to current canary baseline
- Test coverage: parity-critical unread, badge, and inbox flows have automated coverage for channel, DM, and thread paths

#### Release Gates

- Complete canary hardening with parity test pass and no unresolved P0/P1 unread correctness defects
- Validate telemetry dashboards for unread mismatch rate, jump-to-unread success, and badge consistency before promotion
- Confirm docs and settings copy reflect shipped unread semantics, especially for mentions-only and mute combinations
- Roll out with feature flags and staged exposure, with explicit rollback criteria for badge drift or read-state corruption

### Version 1.7 Scope (Q2 2026)

Status: Planned. Version 1.7 builds on the 1.6 unread and inbox foundation to improve high-volume catch-up, social onboarding flow quality, and daily moderation/admin usability.

#### Must Ship

- Inbox digest v1.5 on top of the shipped inbox contract:
  daily and weekly digest-ready summary API shape, deterministic grouping, and stable unread anchors across channel and DM contexts
- High-volume unread triage workflows:
  bulk catch-up actions by scope, stronger mention-priority views, and predictable unread ordering under concurrent realtime events
- Social and onboarding parity improvements:
  friend-only DM controls, improved first-run path from onboarding to first server and first conversation, and richer profile card consistency across chat/member/admin surfaces
- Moderation/admin workflow polish:
  clearer banned and muted member review flows, stronger effective-permission visibility, and more usable audit filtering for common moderator tasks

#### Should Ship

- Category and role-management polish from the shipped server-organization foundation:
  improved reordering ergonomics, hierarchy clarity, and role-management guidance
- Reliability and observability extensions for unread/digest correctness:
  improved mismatch diagnostics, alerting thresholds, and faster operator triage paths
- Accessibility and keyboard parity improvements in inbox, moderation lists, and profile-card actions

#### Could Ship (If Capacity Allows)

- Announcement-style channel follow-on foundation for community-oriented server workflows
- Digest delivery experiments for future mobile-facing notification surfaces
- Initial ecosystem decision artifact for webhooks go/no-go with concrete security and abuse constraints

#### Acceptance Criteria

- Digest correctness: digest summaries match server-side unread state and preserve deterministic grouping and ordering
- Triage reliability: bulk read and catch-up actions remain idempotent and converge under concurrent updates
- Mention priority accuracy: mentions remain visible and correctly prioritized when thread unread items are suppressed by user settings
- Social boundary behavior: friend-only DM controls enforce policy without regressions in existing DM creation/navigation flows
- Moderation productivity: moderator and admin task completion for common ban/mute/audit tasks improves versus 1.6 baseline
- Accessibility parity: new and updated controls remain keyboard reachable and screen-reader labeled in parity-critical surfaces
- Performance guardrails: no material regression in inbox query latency, chat render responsiveness, or moderation list load times
- Test coverage: new digest, triage, social-boundary, and moderation workflows have automated API and UI regression coverage

#### Release Gates

- 1.6 stable rollout telemetry remains healthy before enabling 1.7 digest and triage defaults broadly
- Digest and triage feature flags ship with staged rollout and rollback criteria tied to unread mismatch and anchor-failure metrics
- Friend-only DM controls and moderation workflow changes complete permission-regression validation before general availability
- Docs remain aligned across roadmap, section docs, and OpenAPI for first-party visible API behavior

#### Not In 1.7

- Voice or video calling
- Screen sharing
- Native mobile app delivery
- Full bots and slash-command platform delivery

### Q2 2026

- Continue closing parity gaps where a feature exists in one chat surface but not another
- Continue polishing the newly shipped category-management UX and permissions model
- Build digest-style follow-on work on top of the shipped unread-history foundation
- Validate post-ship unread telemetry and adjust rollout defaults for related feature flags

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
