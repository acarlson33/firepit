# Feature Flags

## Purpose

Firepit uses a small server-side feature flag system for controlled rollout of capabilities that affect product access or operational behavior.

## Current Flags

The live flag definitions are:

- `allow_user_servers`: default `false`; controls whether regular users can create their own servers
- `enable_audit_logging`: default `true`; controls whether moderation actions should be recorded for audit visibility

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
