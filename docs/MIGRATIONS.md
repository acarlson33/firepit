# Migrations

This document captures one-off or staged data migrations that operators may need to run during upgrades.

## Migrate Legacy Servers isPublic

Some legacy server records may be missing `isPublic`. Current discovery behavior only treats records with `isPublic === true` as public, so each server must have an explicit boolean.

The setup script includes a helper named `migrateLegacyServersIsPublic` in `scripts/setup-appwrite.ts`.

### Dry run and policy

Choose your default policy for missing values:

- `true`: preserve broader discoverability
- `false`: default to private visibility

### Run

Use the setup script with migration flags:

```bash
MIGRATE_LEGACY_SERVERS_IS_PUBLIC=true \
MIGRATE_LEGACY_SERVERS_IS_PUBLIC_DEFAULT=false \
bun run setup
```

### Expected outcome

- All `servers` documents have an explicit `isPublic` value (`true` or `false`).
- `/api/servers/public` includes only records with `isPublic === true`.

## Announcements idempotency index upgrade

The setup script also backfills missing `announcements.idempotencyKey` values and ensures `idx_idempotency` is a `unique` index. If a legacy non-unique index exists, setup recreates it with the expected definition.
