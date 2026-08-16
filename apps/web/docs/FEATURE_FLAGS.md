# Feature Flags

## Purpose

Firepit uses a small server-side feature flag system for controlled rollout of capabilities that affect product access or operational behavior.

## Current Flags

The live flag definitions are:

- `allow_user_servers`: default `false`; controls whether regular users can create their own servers
- `enable_audit_logging`: default `true`; controls whether moderation actions should be recorded for audit visibility
- `enable_per_message_unread`: default `false`; gates the Phase 4 rollout from thread-level unread semantics to per-message unread semantics
- `enable_inbox_digest`: default `false`; gates the Phase 4 digest endpoint and hook scaffolding rollout
- `enable_inbox_digest_v1_5`: default `false`; temporary gate for Digest API v1.5 rollout behavior

Rollout note for `enable_per_message_unread`:

- Keep disabled until message-level unread persistence and parity tests are complete.
- Enable first in internal environments, then ramp gradually in production.
- Keep the current thread-based inbox contract as the stable fallback while disabled.
- Promotion gate metrics:
    - unread mismatch rate between scoped inbox summaries and rendered badges
    - jump-to-unread success and fallback frequency
    - mark-all-read convergence latency under realtime updates
    - badge drift incidents between channel, DM, and inbox surfaces

Rollout note for `enable_inbox_digest`:

- Keep disabled until digest endpoint validation and hook-level regression tests are stable.
- Enable in internal environments first, then ramp gradually.
- Use digest payloads as additive support for unread workflows, not as a replacement for existing inbox contracts during rollout.
- Confirm digest ordering and total-unread semantics match inbox contract expectations before broad rollout.

Rollout note for `enable_inbox_digest_v1_5`:

- Treat this as a temporary rollout flag for 1.7 only.
- Enable first in internal/canary environments, then ramp gradually after digest correctness metrics remain stable.
- Keep the public digest response contract backward-compatible while this flag is enabled.
- Remove this flag and related branching before the 1.7 release cut; final Digest API v1 behavior should be enabled by default.

Cleanup commit plan for `enable_inbox_digest_v1_5` (within 1.7):

1. Merge final v1.5 digest behavior as default path in `listInboxDigest`.
2. Remove route-level reads of `enable_inbox_digest_v1_5` and all `useDigestV15` plumbing.
3. Delete `ENABLE_INBOX_DIGEST_V1_5` from feature-flag constants, defaults, setup seeding, and descriptions.
4. Collapse tests to single default-on digest behavior (no temporary v1/v1.5 branching assertions).
5. Remove this rollout note and keep only final-state digest flag documentation.
6. Run targeted digest tests + full lint/build before release cut.

## Phase 3 Rollout Gates

Use these gates before promoting unread-related flags from canary to stable:

1. No unresolved P0 or P1 unread correctness defects.
2. Parity-critical unread tests pass for channel, DM, and thread surfaces.
3. Telemetry signals stay within acceptable thresholds for two consecutive observation windows.
4. Rollback path is verified by disabling `enable_per_message_unread` without data corruption.
5. User-facing docs and OpenAPI contracts match shipped inbox and digest behavior.

## How Flags Work

Flags are stored in Appwrite and cached briefly in-memory to reduce repeated reads. If a flag cannot be loaded, the application falls back to its default value.

Implementation characteristics:

- typed flag keys are defined centrally
- default values are explicit
- descriptions are generated alongside the key definition
- updates clear the in-memory cache for that specific flag
- missing flags can be initialized automatically

## API Surface

Current public flag endpoint:

- `GET /api/feature-flags/allow-user-servers`

This endpoint exists to expose the `allow_user_servers` state to the client. Administrative mutation still happens through server-side code paths rather than a broad public flag-management API.

## Adding A New Flag

1. Add the key to `FEATURE_FLAGS`.
2. Add the default value to `DEFAULT_FLAGS`.
3. Add a human-readable description in `getFeatureFlagDescription`.
4. Use the flag in server or client code with a safe fallback path.
5. Update this document and the OpenAPI spec if the flag is publicly exposed.

## Usage Rules

- Prefer server-side checks when a flag gates data access or write permissions.
- Client-side checks are appropriate for UI affordances and progressive disclosure.
- Do not assume a flag exists in storage; defaults are part of the contract.
- Feature flags should change behavior cleanly without forcing schema migrations for unrelated features.

## Recommended Rollout Pattern

1. Ship the code path behind a safe default.
2. Expose or test it internally.
3. Enable it for the intended environment.
4. Remove the flag after the feature is stable and permanently enabled.

## Documentation Rule

Do not create standalone rollout-summary markdown files for a single flag or launch. Update this file and the relevant product or admin section doc instead.
