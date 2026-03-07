# Product And Onboarding

## Purpose

Firepit is a real-time chat platform built around servers, channels, direct messages, and role-aware moderation. The application runs on Next.js 16, React 19, Bun, and Appwrite, with realtime updates layered on top of Appwrite subscriptions.

This document covers the user-facing entry points into the product: signing in, profile setup, onboarding, joining communities, and starting conversations.

## Core Product Areas

- Servers: shared spaces with channels, members, roles, invites, moderation, and audit visibility
- Channels: the primary place for server conversations, pinned messages, reactions, threads, file attachments, and mentions
- Direct messages: 1:1 and group conversations with pins, threads, reactions, mute controls, and attachments
- Profiles and presence: display names, avatars, pronouns, bios, status, and batch profile lookup APIs
- Discovery and joining: public server listings, invite previews, invite redemption, and optional user-created servers

## New User Flow

1. Sign in through Appwrite-backed authentication.
2. Load the current session via `/api/me`.
3. Resolve profile and presence data through profile and status endpoints.
4. If the account is new, route the user through onboarding and profile completion.
5. Join an existing server through an invite, public directory, or direct server join flow.
6. Start participating in channels and direct messages.

## Onboarding Expectations

The onboarding experience should collect or confirm the following information early:

- display name or username
- avatar selection
- optional pronouns and bio
- initial server selection or invite redemption path

Onboarding copy and UI can change, but the flow should stay aligned with the underlying APIs:

- `/api/me`
- `/api/profile/{userId}`
- `/api/users/{userId}/profile`
- `/api/profiles/batch`
- `/api/status`

## Discovery And Joining

Firepit supports multiple entry paths into a server:

- public server discovery through `/api/servers/public`
- direct join requests through `/api/servers/join`
- invite previews and redemption through `/api/invites/{code}` and `/api/invites/{code}/join`
- server creation through `/api/servers/create` and server listing through `/api/servers`

User-created servers are feature-flag controlled. If `allow_user_servers` is disabled, the UI should hide or disable self-service server creation rather than surfacing a failing action.

## Profile And Identity Model

The product uses Appwrite accounts plus a profile layer for presentation fields. Documentation and UI should treat the following as first-class profile attributes when available:

- display name
- username or account name
- avatar URL
- pronouns
- bio
- online status and optional custom message

Profile and identity data is used across server membership views, message rendering, typing indicators, audit log enrichment, and search results.

## User-Facing API Surface

These endpoints matter most to the product shell and onboarding flows:

- `GET /api/me`
- `GET /api/version`
- `GET /api/servers`
- `GET /api/servers/public`
- `POST /api/servers/join`
- `POST /api/servers/create`
- `GET /api/profile/{userId}`
- `GET /api/users/{userId}/profile`
- `POST /api/profiles/batch`
- `GET /api/users/search`
- `POST|GET|PATCH|DELETE /api/status`
- `POST /api/status/batch`

## Product Constraints

- Authentication is cookie-based through Appwrite sessions.
- Membership and channel access checks are enforced server-side.
- Profile and status data are used for enrichment and may be partial for older records.
- Feature-flagged experiences must degrade cleanly when disabled.

## Documentation Boundaries

Use this file for product-level user flows. Put deeper implementation details in the matching section docs:

- chat mechanics: `CHAT_AND_REALTIME.md`
- administration and moderation: `SERVER_ADMINISTRATION.md`
- flags and rollout behavior: `FEATURE_FLAGS.md`
- performance, monitoring, and release mechanics: `PLATFORM_OPERATIONS.md`
