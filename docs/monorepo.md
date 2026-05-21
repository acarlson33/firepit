# Monorepo Layout

This repository is a Bun workspace with two apps:

- `apps/web` - Next.js web app
- `apps/mobile` - Expo React Native app

## Install

Run dependency installation from the repository root:

```bash
bun install
```

The root `bun.lock` is the single lockfile for the workspace.

## Common Commands

From the repository root:

```bash
bun run dev
bun run build
bun run test
bun run lint
bun run typecheck
```

The root scripts forward to the workspace apps through `turbo` or direct app commands.

## App Commands

Web app:

```bash
cd firepit-web && bun run dev
```

Mobile app:

```bash
cd firepit-reactnative && bun run start
```
