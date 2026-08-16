# AGENTS.md

Guidance for AI agents working in this repository.

## Changelog & Release Notes

User-facing changes (features, bug fixes, notable improvements) must be
documented as part of the change — never left for later. Changelog enforcement
for PRs is planned; treat it as required already.

- **Web** (`apps/web`): add an entry under the current version in
  `apps/web/CHANGELOG.md`, following the Keep a Changelog format used there.
  Bump the `"version"` in `apps/web/package.json` when cutting a release.
- **Mobile** (`apps/mobile`): release notes live in the GitHub release body
  for each version (the in-app updater reads it via
  `apps/mobile/src/lib/update/github.ts`). Note user-facing changes for the
  next release and bump the `"version"` in `apps/mobile/package.json` when
  cutting one.

Keep entries concise and user-facing. Infrastructure-only work (refactors,
dependency bumps, build config) can be skipped or listed under an
"Improvements" heading.
