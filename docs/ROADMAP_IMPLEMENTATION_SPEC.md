# Roadmap Implementation Spec

This document is the technical companion to [../ROADMAP.md](../ROADMAP.md). The roadmap answers what matters for Discord parity and product direction. This spec answers how planned parity work should be implemented, validated, and rolled out.

## How To Use This Document

- Keep roadmap status and product priority in [../ROADMAP.md](../ROADMAP.md).
- Keep durable technical breakdowns for active and near-term roadmap work here.
- When a workstream moves from investigating to planned, add or expand its implementation section in this file.
- When a workstream ships, move durable technical facts into the relevant section docs and reduce the spec entry to rollout notes or remove it.

## Source Of Truth Order

When implementation questions conflict across docs, use this order:

1. Current product and API behavior
2. Section docs in `docs/`
3. [../ROADMAP.md](../ROADMAP.md)
4. This implementation spec

This document should not override live behavior. It should describe intended implementation for planned work.

## Delivery Model

Each roadmap workstream should be described using the same structure:

- Objective: what parity gap the work closes
- User-facing outcome: what users will notice
- Backend scope: API, data model, permissions, realtime, jobs, and migrations
- Frontend scope: pages, dialogs, hooks, navigation, and UI states
- Testing: unit, integration, API, and realtime coverage required before rollout
- Rollout notes: flags, migrations, observability, and backward-compatibility concerns

## Workstream A: Channel Categories

Status: Shipped in March 2026. Remaining work is follow-on polish, not core delivery.

### Objective

Close the most visible server-navigation parity gap by allowing channels to be grouped into collapsible categories with stable ordering.

### User-Facing Outcome

- Server sidebars support category headers with nested channels
- Categories can be collapsed and expanded
- Server admins can create, rename, reorder, and delete categories
- Channels can be assigned into or out of categories and reordered with explicit controls
- Category changes now update the sidebar and settings UI immediately, with optimistic feedback during sync

### Backend Scope

- Shipped scope:
    - `categories` collection with:
    - `$id`
    - `serverId`
    - `name`
    - `position`
    - `createdBy`
    - timestamps
- Channel records extended with:
    - `categoryId?: string`
    - `position: number`
- Category and channel management APIs support:
    - listing categories by server
    - creating, updating, deleting categories
    - moving channels between categories
    - reordering categories
- Role and permission checks use the same effective-permission model already used for channel and role administration
- Channels without a category remain fully supported

### Frontend Scope

- Sidebar rendering that groups channels under category containers
- Category collapse state persisted per server in lightweight client storage
- Server settings UI for category CRUD
- Explicit move controls for category and channel ordering, with drag-and-drop remaining optional future polish
- Optimistic updates and in-flight UI states so reassignment and reordering feel immediate instead of refetch-bound
- Empty and degraded states for servers that have no categories or partially configured data

### Testing

- API tests for category CRUD and reordering
- Permission tests for admin versus non-admin role behavior
- Hook/component tests for collapsed state, optimistic rendering, and ordered rendering
- Regression tests that verify uncategorized channels still render correctly

### Rollout Notes

- Core category delivery is complete and no longer needs feature-flag framing in roadmap status
- Remaining follow-up work should focus on drag-and-drop, permission polish, and broader server-organization UX

## Workstream B: Notification Controls Parity

### Objective

Move from basic mute controls to Discord-like notification preferences across server, channel, and DM scopes.

### User-Facing Outcome

- Users can choose all messages, mentions only, or nothing
- Users can mute for a duration or indefinitely
- Users can configure quiet hours and desktop/push behavior
- Notification preference behavior is consistent across servers, channels, and conversations

### Backend Scope

- Standardize the notification settings document shape used by `/api/notifications/settings`
- Ensure `serverOverrides`, `channelOverrides`, and `conversationOverrides` support both `level` and `mutedUntil`
- Reuse existing mute endpoints where possible, but normalize payloads and validation rules across:
    - `/api/servers/{serverId}/mute`
    - `/api/channels/{channelId}/mute`
    - `/api/conversations/{conversationId}/mute`
- Add or normalize support for:
    - quiet hours
    - desktop notifications
    - push notifications
    - sound preferences
- Define precedence clearly:
    - conversation or channel override
    - server override
    - global default

### Frontend Scope

- A unified notification settings surface instead of scattered mute-only controls
- Reusable mute dialog component shared by server, channel, and conversation views
- UI indicators for muted contexts and effective notification level
- Clear conflict resolution messaging when global and local settings differ

### Testing

- API tests for settings retrieval and partial updates
- Precedence tests for override resolution
- Hook tests for mute and unmute mutations
- UI tests for settings forms, duration presets, and degraded states

### Rollout Notes

- Preserve existing mute state during schema changes
- Log settings write failures and invalid override payloads
- Avoid introducing notification regressions in channels that currently depend on mute-only behavior

## Workstream C: Cross-Surface Messaging Consistency

### Objective

Ensure that parity features that already exist behave consistently across channel chat, DM chat, threads, pinned views, and search navigation.

### User-Facing Outcome

- Users should not find a feature in channels that behaves differently or disappears in DMs without an intentional reason
- Search results, pins, and thread views should land users in predictable message state

### Backend Scope

- Audit existing message feature support for channels and DMs:
    - replies
    - mentions
    - reactions
    - threads
    - pins
    - attachments
    - mute state interactions
- Normalize serialization and enrichment fields where the same concept exists in both message types
- Document intentional differences instead of letting them emerge by accident

### Frontend Scope

- Shared component behavior for message actions where feasible
- Shared navigation helpers for jump-to-message flows from search, pins, and threads
- Consistent optimistic-update behavior and failure recovery across chat surfaces
- Consistent unread and active-thread indicators where supported

### Testing

- Cross-surface regression suite that runs the same assertions for channels and DMs where parity is expected
- Search-to-message navigation tests
- Pinned-item and thread-entry tests

### Rollout Notes

- This workstream should generally ship incrementally with no separate feature flag unless a behavioral change is high risk

## Workstream D: Onboarding And Social Graph Polish

### Objective

Reduce friction between account creation, profile setup, joining a server, adding friends, and starting conversations.

### User-Facing Outcome

- New users complete profile setup earlier and with clearer defaults
- Invite redemption, public discovery, and first-server join flows feel connected
- Friend and block flows integrate better with DM creation and profile surfaces

### Backend Scope

- Reuse current endpoints where possible:
    - `/api/me`
    - `/api/profile/{userId}`
    - `/api/users/{userId}/profile`
    - `/api/profiles/batch`
    - `/api/servers/public`
    - `/api/servers/join`
    - `/api/friends`
- Add missing data only if current profile payloads cannot support richer member cards or mutual relationship presentation
- Define behavior for friend-only DM restrictions without breaking existing direct-message flows

### Frontend Scope

- Profile completion gates or prompts in onboarding
- Better post-invite and post-discovery entry points into joined servers
- Richer user cards and mutual relationship views if supported by backend data
- Better integration between friends list, user search, and new conversation creation

### Testing

- End-to-end onboarding tests for new accounts
- Invite redemption and first-server navigation tests
- Friend request, accept, remove, block, and DM-eligibility tests

### Rollout Notes

- Keep feature-flag checks explicit where onboarding options depend on server creation or discovery behavior

## Workstream E: Moderation And Admin Workflow Polish

### Objective

Improve the daily usability of moderation surfaces without changing the core permission model.

### User-Facing Outcome

- Admins can review invite state, permissions, and moderation history more efficiently
- Moderators can find banned or muted members and understand why actions were taken
- Audit data is easier to filter and interpret

### Backend Scope

- Build on existing moderation and audit APIs instead of creating parallel surfaces
- Fill any gaps in server-level admin queries for:
    - banned users
    - muted users
    - effective permission summaries
    - audit filtering/export parameters
- Normalize audit payload shapes where older and newer records differ

### Frontend Scope

- Improve server settings information architecture for roles, invites, moderation, and audit views
- Add clearer tables or filtered views for bans and mutes
- Show effective permissions more transparently when editing roles or overrides

### Testing

- API tests around audit filters and moderation lists
- Component tests for admin settings views and moderation dialogs
- Permission regression tests for moderator versus owner versus admin visibility

### Rollout Notes

- Admin-facing changes do not need separate feature flags unless data model changes are required

## Workstream F: Bots, Webhooks, And Ecosystem Decision

### Objective

Decide whether ecosystem parity belongs on the active roadmap and, if so, define the minimum viable platform surface.

### Decision Inputs

- Self-hosting demand for integrations
- Security and abuse implications
- Operational support burden
- Whether webhooks should come before bots

### Minimum Viable Webhook Scope

- Outbound server webhooks only
- Scoped to channels or server events
- Signed delivery and retry policy
- Admin-only configuration UI

### Minimum Viable Bot Scope

- Explicitly out of scope until webhook requirements, auth model, and moderation constraints are defined

### Deliverable

- Produce an architecture decision record or update this spec with a go or no-go recommendation by Q3 2026

## Non-Goals For Near-Term Execution

The roadmap keeps these visible, but this spec does not treat them as active implementation workstreams yet:

- Voice and video calling
- Screen sharing
- Native mobile apps
- Forum or stage channel types
- Full Discord activity integrations

## Documentation Exit Criteria

Before a planned workstream is marked live in [../ROADMAP.md](../ROADMAP.md):

- Product-facing behavior must be reflected in the relevant section docs
- API changes must be reflected in `openapi-doc.yml` when public or first-party client visible
- README claims must not contradict shipped behavior
- This spec must either be reduced to rollout notes or updated to reflect the next planned phase
