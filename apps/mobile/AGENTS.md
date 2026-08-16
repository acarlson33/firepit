# AGENTS.md (mobile)

## Release Notes

The mobile app has no changelog file; release notes are written into the
GitHub release body for each version. The in-app updater reads them via
`src/lib/update/github.ts` and displays them in the update prompt.

When you make a user-facing change (feature, bug fix, notable improvement):

1. Note it for the next release's notes (see the repo root `AGENTS.md`).
2. Bump `"version"` in `package.json` when cutting a release — the app reads it
   via `src/lib/update/constants.ts`.
