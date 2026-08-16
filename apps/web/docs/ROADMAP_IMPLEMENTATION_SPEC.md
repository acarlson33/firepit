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

Status: Shipped in March 2026. Remaining work is follow-on attention-management polish, not core notification-controls delivery.

### Objective

Move from basic mute controls to Discord-like notification preferences across server, channel, and DM scopes.

### User-Facing Outcome

- Users can choose all messages, mentions only, or nothing
- Users can mute for a duration or indefinitely
- Users can configure quiet hours and desktop/push behavior
- Notification preference behavior is consistent across servers, channels, and conversations
- Users can review scoped overrides with readable labels, filter them, and perform bulk cleanup actions from settings

### Backend Scope

- Shipped scope:
    - standardized `notification_settings` document handling through `/api/notifications/settings`
    - normalized override maps for `serverOverrides`, `channelOverrides`, and `conversationOverrides` with `level` and `mutedUntil`
    - timezone-aware quiet hours persistence
    - desktop, push, sound, and direct-message privacy preferences
    - server-side override label enrichment for settings responses using memberships, channels, conversations, and profile lookups
    - legacy-document backfill for older notification settings records missing newer required fields
- Reused and aligned mute endpoints across:
    - `/api/servers/{serverId}/mute`
    - `/api/channels/{channelId}/mute`
    - `/api/conversations/{conversationId}/mute`
- Effective precedence remains:
    - conversation override
    - channel override
    - server override
    - global default

### Frontend Scope

- Shipped scope:
    - unified notification settings surface instead of scattered mute-only controls
    - reusable mute dialog shared by server, channel, and conversation views
    - readable scoped override labels in settings
    - filterable override management with status pills and bulk actions
    - conflict-resolution and precedence messaging when global and local settings differ
    - settings-page section navigation to improve discoverability of notification controls inside the broader settings surface

### Testing

- API tests for settings retrieval and partial updates
- Precedence tests for override resolution
- Mutation coverage for mute and unmute flows across scopes
- UI tests for settings forms, bulk actions, duration presets, and degraded states
- Full repository validation currently passes with the shipped notification-controls work

### Rollout Notes

- Existing mute state is preserved during schema evolution
- The Appwrite bootstrap now includes the missing quiet-hours timezone field
- Legacy notification settings documents are backfilled lazily so partial updates do not fail on newly required attributes
- Remaining roadmap work should target unread/inbox semantics rather than reworking the core notification settings model

## Workstream C: Cross-Surface Messaging Consistency

Status: In progress. The shared navigation, normalized pin-thread contracts, optimistic pin-thread state slice, unread-thread follow-on slice, and unified inbox/jump-to-unread client slice shipped in March 2026; broader full-message unread and digest-style parity is still follow-on work.

### Objective

Ensure that parity features that already exist behave consistently across channel chat, DM chat, threads, pinned views, and search navigation.

### User-Facing Outcome

- Users should not find a feature in channels that behaves differently or disappears in DMs without an intentional reason
- Search results, pins, and thread views should land users in predictable message state
- Channel and DM surfaces should share the same deep-link and highlight behavior when a user opens a message from search or pinned history

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
- No new REST endpoints are required for the shipped slice; existing search, pin, thread, and typing APIs already expose the identifiers needed for shared client navigation
- The shipped follow-on slice normalized channel and DM pin-list responses around the same shape, ordering, and enriched pin metadata
- The shipped follow-on slice normalized channel and DM thread responses around the same item-oriented contract while preserving legacy keys during client transition
- DM thread replies now flatten onto the root thread for metadata updates, matching channel-side thread-parent behavior
- Thread read state now persists through a dedicated `thread-reads` API so unread state survives across sessions and devices
- DM conversation payloads now include unread thread aggregates for inbox-style sidebar affordances
- The next unread-history slice introduces a dedicated inbox contract for unread thread activity and mentions instead of relying on search-derived mention results as the long-term inbox source

### Frontend Scope

- Shipped slice:
    - shared navigation helpers for jump-to-message flows from search results, pinned items, and message highlight deep links
    - shared pin and thread client helpers across channel and DM surfaces
    - shared hook state for pin and thread behavior in `useMessages` and `useDirectMessages`
    - route-driven context selection and highlight behavior for both channel and DM chat landings
    - normalized pin-list payload handling across channel and DM surfaces, including shared pinned metadata in the normalized message model
    - optimistic pin and thread-reply behavior in the shared hook layer with rollback and reply-pending UI support across channel and DM thread views
    - shared unread-thread tracking in the hook layer, with thread-open read reconciliation, server-backed read sync, and shared unread indicator projection across channel and DM message lists
    - DM sidebar inbox and mentions surfaces, including unread badges on conversations and the top-level DMs switch
- Remaining follow-on scope:
    - full-message unread extension on top of the current thread-and-mention model
    - digest-style and mobile-facing unread delivery on top of the current inbox contract
    - shared component behavior for remaining message actions where feasible
    - broader history and message-action parity beyond the current pin-thread-unread slice

### Testing

- Shipped slice coverage:
    - search-to-message navigation tests
    - pinned-item and thread-entry tests for channel and DM surfaces
    - shared client and shared hook regression coverage for pin-thread state
    - dedicated hook coverage for both `useMessages` and `useDirectMessages`
    - parity regression coverage for normalized channel and DM pin-list and thread response contracts
    - optimistic pin-toggle and thread-reply regression coverage in the shared hook layer, including rollback behavior
    - unread-thread regression coverage for the shared hook, channel and DM hook projections, and thread indicator rendering
    - dedicated route coverage for persisted thread-read synchronization and sidebar coverage for inbox and mentions behavior
- Remaining parity work should continue extending cross-surface regression coverage where the same affordance exists in both surfaces
- The unread-history follow-on slice should add route coverage for the inbox contract, mention persistence or projection, and unread-entry navigation across both channel and DM surfaces

### Rollout Notes

- This workstream should generally ship incrementally with no separate feature flag unless a behavioral change is high risk
- The March 2026 slice began without backend contract changes, but later parity follow-up normalized existing channel and DM pin-thread response contracts while retaining legacy keys needed by older client paths during rollout

### Phase 1 (March 2026): Unread Contract Lock

Phase 1 for the per-message unread follow-on is complete once these constraints are documented and treated as implementation guardrails:

- Introduce an explicit inbox contract version marker in inbox responses so clients can branch safely during rollout.
- Preserve `thread_v1` behavior as the default and backward-compatible read model until per-message persistence is fully validated.
- Keep unread semantics deterministic across channel and DM surfaces:
    - read state reconciliation remains server authoritative
    - unread anchors must always target a valid message or degrade to context-level catch-up
    - unread counts and badge semantics must derive from the same inbox aggregation source
- Gate per-message unread behavior behind a dedicated feature flag so rollout can be staged without forcing a migration cutover.
- Keep mention-read behavior (`PATCH /api/inbox`) and thread-read persistence (`/api/thread-reads`) stable while phase 2 data-model work is underway.

Phase 1 does not change the persistence model. It locks API expectations, rollout strategy, and compatibility behavior so phase 2 can ship with lower regression risk.

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

## Version 1.7 Delivery Plan (Q2 2026)

Version 1.7 is the first post-1.6 stabilization-and-expansion cycle. It should treat the shipped unread/inbox model as stable input and focus on digest and triage behavior, social boundary polish, and moderation/admin workflow quality.

### Scope Summary

- Workstream C follow-on: inbox digest semantics and high-volume unread triage
- Workstream D follow-on: friend-only DM boundaries and onboarding/social-graph polish
- Workstream E follow-on: moderation/admin information architecture and audit usability
- Workstream A follow-on (limited): category and role-management UX polish that does not require a new server model

### Phase Plan

#### Phase 1: Stabilize 1.6 Baseline (Week 1)

- Freeze new unread-model contract changes unless they are correctness fixes
- Confirm unread, badge, and jump telemetry baselines from 1.6 staged rollout
- Lock alert thresholds for:
    - unread mismatch rate
    - unread-anchor failure rate
    - mark-read convergence latency
- Exit criteria:
    - no unresolved P0/P1 unread correctness defects
    - telemetry dashboards available and reviewed

#### Phase 2: Digest And Triage Backend (Weeks 2-4)

- Add digest-ready inbox summary contract extension on top of existing inbox response shape
- Preserve backward compatibility for existing clients by keeping current inbox payload fields stable
- Implement deterministic digest grouping keys and ordering rules across channel and DM contexts
- Add scope-aware bulk catch-up endpoints or request modes on existing inbox mutation surface
- Keep mention-priority semantics explicit when mentions-only suppression is active
- Exit criteria:
    - deterministic output across repeated queries on unchanged data
    - no regression in existing inbox or thread-read API behavior

#### Phase 3: Client Triage, Social Boundaries, Moderation UX (Weeks 4-7)

- Inbox and chat surfaces:
    - digest and triage views using shared navigation and unread anchor helpers
    - bulk catch-up controls with explicit loading, success, and rollback states
- Social/onboarding surfaces:
    - friend-only DM controls exposed in settings and enforced in DM entry points
    - first-run path updates that connect profile completion, server join, and first conversation start
    - consistent user-card/profile summary fields across chat, member, and moderation surfaces
- Moderation/admin surfaces:
    - clearer banned and muted-member review lists
    - improved effective-permission explainability in admin flows
    - streamlined audit filtering for frequent moderator tasks
- Exit criteria:
    - parity-critical flows covered in component and route tests
    - no unresolved P0/P1 UX regressions in inbox/chat/moderation paths

#### Phase 4: Hardening And Rollout (Weeks 8-9)

- Run focused load and regression passes for digest queries and moderation lists
- Validate feature-flag staged rollout behavior and rollback automation
- Final documentation alignment pass across roadmap, section docs, and OpenAPI
- Exit criteria:
    - release-gate checks pass
    - rollout and rollback playbooks documented in operations docs

### Backend Implementation Requirements

- Keep inbox contract versioning explicit for new digest fields so clients can branch safely
- Maintain server-authoritative read reconciliation and idempotent mark-read semantics
- Reuse existing auth and permission enforcement paths for friend-only DM and moderation queries
- Avoid introducing parallel moderation APIs when existing endpoints can be extended safely
- Ensure new digest or triage fields are included in OpenAPI when first-party visible

### Frontend Implementation Requirements

- Reuse shared message navigation and unread helpers before introducing new per-surface logic
- Keep channel and DM unread triage behavior aligned unless divergence is intentionally documented
- Provide explicit empty/loading/error states for digest and triage UI paths
- Preserve keyboard and screen-reader parity for new controls and batch actions

### Testing Requirements

- API tests:
    - digest grouping and sorting determinism
    - scope-aware bulk catch-up and mark-read idempotency
    - friend-only DM policy enforcement
    - moderation list and audit-filter correctness
- UI and hook tests:
    - digest and triage rendering across channel and DM contexts
    - unread-anchor navigation from digest entries
    - social boundary and onboarding flow transitions
    - moderation/admin task flows and permission messaging
- Regression and rollout tests:
    - feature-flag on/off compatibility
    - backward compatibility for existing inbox consumers
    - observability signal validation for rollout dashboards

### Rollout Notes

- Gate digest and triage behavior behind dedicated feature flags during staged rollout
- Promote friend-only DM controls with conservative defaults and clear user-facing messaging
- Treat moderation/admin IA changes as opt-in staged UI updates if high-risk workflows are impacted
- Keep rollback criteria explicit for unread mismatch, digest-anchor failures, and moderation query regressions
