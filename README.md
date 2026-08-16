# Firepit

A monorepo containing the Firepit web and mobile applications. Built with modern tooling including Next.js, React Native/Expo, TypeScript, and Appwrite.

## 📦 Workspace Overview

### Apps

- **[apps/web](./apps/web)** — Next.js web application
    - Modern React 19 frontend with App Router
    - Real-time features via Appwrite
    - TailwindCSS styling
    - Type-safe API integration

- **[apps/mobile](./apps/mobile)** — React Native mobile app with Expo
    - iOS, Android, and web support
    - Shared Appwrite backend
    - Native performance with React Native

### Monorepo Tools

- **Package Manager**: [Bun](https://bun.sh/) (`^1.3.14`)
- **Build System**: [Turbo](https://turbo.build/) for fast, incremental builds
- **Language**: TypeScript with strict type checking
- **Node Version**: `>=20.9.0`

## 🚀 Quick Start

### Prerequisites

- Node.js 20.9.0+
- Bun 1.3.14 (install from [bun.sh](https://bun.sh))

### Installation

```bash
# Install dependencies for all workspaces
bun install
```

### Development

```bash
# Start the web app dev server (port 3000)
bun run dev

# Or explicitly run web development
bun run web

# Start mobile development
bun run mobile

# Run mobile on specific platforms
bun run mobile:android
bun run mobile:ios
bun run mobile:web
```

## 📋 Scripts Reference

### Global Scripts (Monorepo)

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `bun run dev`       | Start web development server (shorthand for `web`) |
| `bun run web`       | Start web dev server on port 3000                  |
| `bun run build`     | Build all apps (web, mobile)                       |
| `bun run test`      | Run tests across all workspaces                    |
| `bun run lint`      | Lint all workspaces                                |
| `bun run typecheck` | Type-check all workspaces                          |

### Web App Scripts

All web scripts can be prefixed with `web:` to run from the root. Example: `bun run web:dev`, `bun run web:test`

| Command                                  | Description                                        |
| ---------------------------------------- | -------------------------------------------------- |
| `bun run web:dev`                        | Start Next.js dev server                           |
| `bun run web:build`                      | Build for production (with SWC)                    |
| `bun run web:build:webpack`              | Build using Webpack instead of SWC                 |
| `bun run web:build:analyze`              | Build with bundle size analysis                    |
| `bun run web:start`                      | Start production server                            |
| `bun run web:test`                       | Run Vitest suite                                   |
| `bun run web:test:coverage`              | Run tests with coverage report                     |
| `bun run web:lint`                       | Run ESLint                                         |
| `bun run web:lint:fix`                   | Run ESLint with auto-fix                           |
| `bun run web:typecheck`                  | Type-check without emitting                        |
| `bun run web:setup`                      | Interactive setup for Appwrite configuration       |
| `bun run web:validate-env`               | Validate environment variables                     |
| `bun run web:validate-env:ci`            | Validate environment variables for CI              |
| `bun run web:cleanup-orphan-memberships` | Database maintenance script                        |
| `bun run web:knip`                       | Check for dead code and unused dependencies        |
| `bun run web:update:force`               | Update Next.js, Appwrite to latest                 |
| `bun run web:update:pin`                 | Update and pin Next.js, Appwrite to exact versions |
| `bun run web:update:check`               | Check for outdated packages                        |

### Mobile App Scripts

All mobile scripts can be prefixed with `mobile:` to run from the root. Example: `bun run mobile:start`, `bun run mobile:android`

| Command                  | Description                    |
| ------------------------ | ------------------------------ |
| `bun run mobile:start`   | Start Expo dev server          |
| `bun run mobile:android` | Run on Android device/emulator |
| `bun run mobile:ios`     | Run on iOS device/simulator    |
| `bun run mobile:web`     | Run in web browser             |
| `bun run mobile:lint`    | Run ESLint                     |

## 📂 Project Structure

```
firepit/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── src/
│   │   ├── public/
│   │   ├── scripts/
│   │   ├── docs/               # Web-specific documentation
│   │   └── package.json
│   │
│   └── mobile/                 # React Native/Expo mobile app
│       ├── src/
│       ├── android/
│       ├── assets/
│       ├── docs/               # Mobile-specific documentation
│       └── package.json
│
├── docs/                       # Monorepo documentation
├── package.json                # Root workspace configuration
├── turbo.json                  # Build pipeline configuration
├── tsconfig.json               # TypeScript root config
└── bunfig.toml                 # Bun package manager config
```

## 🔧 Development Workflow

### Building

```bash
# Build all apps
bun run build

# Build specific app
bun run web:build
bun run web:build:webpack    # Alternative build with Webpack
```

### Testing

```bash
# Run all tests
bun run test

# Run with coverage
bun run web:test:coverage
```

### Code Quality

```bash
# Lint all workspaces
bun run lint

# Auto-fix linting issues
bun run web:lint:fix

# Type checking
bun run typecheck

# Dead code and unused dependency checking
bun run web:knip
```

### Environment Setup

```bash
# Interactive setup for web app (Appwrite, etc.)
bun run web:setup

# Validate environment variables
bun run web:validate-env

# For CI environments
bun run web:validate-env:ci
```

## 📚 Documentation

- [Monorepo Architecture](./docs/monorepo.md)
- **Web App**: See [apps/web/README.md](./apps/web/README.md) and [apps/web/docs/](./apps/web/docs/)
- **Mobile App**: See [apps/mobile/README.md](./apps/mobile/README.md) and [apps/mobile/docs/](./apps/mobile/docs/)

## 🛠️ Build Pipeline (Turbo)

The monorepo uses Turbo for optimized, incremental builds. Configured tasks:

- `build` — Depends on dependency builds, caches output
- `lint` — Caches results
- `test` — Depends on `build`, caches results
- `typecheck` — Depends on `build`, caches results

Turbo automatically:

- Parallelizes independent tasks
- Caches build outputs
- Skips unchanged workspaces
- Manages task dependencies

## 💡 Tips & Troubleshooting

### Clear Build Cache

```bash
bunx turbo clean
```

### Reinstall Dependencies

```bash
rm -rf node_modules
rm -rf apps/*/node_modules
bun install
```

### Check Outdated Packages

```bash
bun outdated
bun run web:update:check
```

### Use Webpack Builder for Web

If SWC builds are having issues:

```bash
bun run web:dev:webpack
bun run web:build:webpack
```

## 📝 Contributing

When adding new workspaces or scripts:

1. Update `package.json` workspaces if needed
2. Document new scripts in this README
3. Run `bun run lint` and `bun run typecheck` to validate
4. Ensure Turbo can properly orchestrate new tasks

## 📄 License

The license at [LICENSE](./LICENSE), applies to ALL projects under `apps/`. (The license covers all code in this repository).
