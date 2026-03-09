# Firepit Documentation

This directory was consolidated into a smaller set of durable, section-based documents.

## Sections

- `PRODUCT_AND_ONBOARDING.md`: product overview, account setup, onboarding, discovery, and user-facing flows
- `CHAT_AND_REALTIME.md`: channels, direct messages, reactions, threads, typing, status, search, uploads, pins, and notifications
- `SERVER_ADMINISTRATION.md`: server creation, invites, roles, permission overrides, moderation, audit logs, and admin workflows
- `FEATURE_FLAGS.md`: current flags, defaults, admin access, and how to add a new flag
- `PLATFORM_OPERATIONS.md`: platform architecture, performance strategy, monitoring, releases, and operational notes
- `ROADMAP_IMPLEMENTATION_SPEC.md`: technical breakdown of active roadmap workstreams and parity implementation plans
- `openapi-doc.yml`: current HTTP API contract for supported public endpoints

## Consolidation Notes

The previous documentation set mixed long-lived product guidance with temporary implementation summaries, test notes, and session reports. The current structure keeps product and operational guidance while removing one-off project history.

The following legacy topics are now covered by the section docs above:

- onboarding flow and UI preview
- invite implementation and rollout notes
- audit logging enhancement notes
- roles and permissions guidance
- performance summaries, testing notes, and optimization backlog
- feature flag quickstart and modularity notes
- user server creation rollout notes
- typing indicators, custom emoji behavior, and message workflows
- New Relic monitoring and build versioning guidance

## Editing Guidance

When updating docs, prefer editing one of the section files instead of creating a new standalone markdown file unless the topic is truly independent and expected to remain stable over time.
