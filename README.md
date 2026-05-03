# firepit

> **Version 1.7.0** - Production Ready

A modern, open-source chat platform inspired by Discord, built with Next.js 16, Appwrite, and TypeScript. Firepit includes real-time messaging, servers and channels, direct messages, roles and moderation, social features, and a growing parity roadmap for Discord-like workflows.

## Announcements:

The repository now ships with 50% test coverage across lines, see [Testing](#-testing) for more info.

## Features

- **Servers, channels, and categories** - Discord-style server organization with grouped text channels and in-app category management
- **Direct messages and group DMs** - Private 1:1 and multi-user conversations
- **Server invites and discovery** - Invite links, public server listings, and direct join flows
- **Roles and permissions** - Per-server roles with channel overrides and moderation-aware access control
- **Messaging parity basics** - Replies, mentions, reactions, threads, pins, search, typing indicators, and file attachments
- **Profiles, presence, and social** - User profiles, statuses, friend requests, and blocking
- **Notification controls parity** - Scoped notification levels, quiet hours, mute durations, DM privacy, and bulk override management
- **Moderation and auditability** - Global and server moderation with audit log support
- **User reporting** - Report users for inappropriate profile content with admin review dashboard
- **Profile backgrounds and avatar frames** - Custom background colors, gradients, images, and seasonal/preset avatar frames
- **Custom emoji support** - Standard emoji picker plus uploaded custom emoji assets

## Codebase Features

- **Real-time chat** - Appwrite-backed realtime messaging with typing indicators and presence updates
- **Replies, mentions, reactions, threads, and pins** - Core message workflows across channels and DMs
- **Direct messages and group DMs** - Shared DM infrastructure for 1:1 and multi-user conversations
- **Search and attachments** - Message search plus image, file, video, audio, and document attachments
- **Roles, permissions, categories, and moderation** - Server roles, permission overrides, category management, invite management, bans, kicks, mutes, and audit logs
- **User reporting and admin review** - End-user reporting plus admin triage flows in `src/components/report-user-dialog.tsx`, `src/lib/appwrite-reports.ts`, and `src/app/admin/reports/page.tsx`
- **Profiles and status** - User profile enrichment, avatars, pronouns, bios, and custom status messages
- **Profile backgrounds and avatar frames** - Appearance customization in `src/components/profile-appearance-settings.tsx`, rendering support in `src/components/profile-background.tsx`, and preset frame definitions in `src/lib/preset-frames.ts`
- **Friend system and blocking** - Social graph controls for safer private messaging
- **Notification settings and mute controls** - Consistent override behavior across servers, channels, and DMs with server-enriched labels and quiet hours
- **TypeScript** - Full type safety across the entire codebase
- **Next.js 16** - App Router with React Server Components
- **Tailwind CSS** - Modern, responsive UI styling
- **shadcn/ui** - Accessible UI primitives
- **PWA ready** - Installable web app support for mobile and desktop browsers
- **Comprehensive tests** - 2271 passing tests with broad API, hook, and integration coverage
- **Production hardening** - Error boundaries, rate limiting, security validation, and observability

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** or **Bun 1.2+** (Bun 1.3+ preferred for performance improvements) installed
- An **Appwrite instance** (cloud or self-hosted):
    - Cloud: [appwrite.io](https://appwrite.io) (free tier available)
    - Self-hosted: [Installation Guide](https://appwrite.io/docs/installation)
- **Git** for cloning the repository

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/firepit.git
cd firepit

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.local.example .env.local
nano .env.local  # Edit with your Appwrite credentials

# 4. Validate your configuration
bun run validate-env

# 5. Initialize the database
bun run setup

# 6. Start the development server
bun dev  # Uses Turbopack (~700x faster than Webpack)
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

**Development Commands:**

- `bun dev` - Start with Turbopack (recommended, ~1.5s cold start)
- `bun dev:webpack` - Start with Webpack (fallback, ~12s cold start)
- `bun build` - Production build with Turbopack
- `bun build:webpack` - Production build with Webpack (fallback)

## 📚 Documentation

See the `/docs` folder for detailed guides:

- [Deployment Guide](./DEPLOYMENT.md) - Production deployment instructions
- [Documentation Index](./docs/README.md) - Durable product and platform documentation map
- [Product And Onboarding](./docs/PRODUCT_AND_ONBOARDING.md) - Product shell, onboarding, discovery, and profile flows
- [Chat And Realtime](./docs/CHAT_AND_REALTIME.md) - Messaging, DMs, pins, threads, search, emoji, typing, status, and notifications
- [Server Administration](./docs/SERVER_ADMINISTRATION.md) - Roles, invites, permissions, moderation, and audit logging
- [Feature Flags](./docs/FEATURE_FLAGS.md) - Flag behavior and rollout notes
- [Telemetry Providers](./docs/TELEMETRY.md) - New Relic/PostHog routing, parity, and event mapping matrix
- [Platform Operations](./docs/PLATFORM_OPERATIONS.md) - Performance, monitoring, releases, and operations
- [Roadmap](./ROADMAP.md) - Discord parity roadmap and product priorities
- [Roadmap Implementation Spec](./docs/ROADMAP_IMPLEMENTATION_SPEC.md) - Technical breakdown of roadmap workstreams
- [Changelog](./CHANGELOG.md) - Version history and release notes

## 🚀 Production Deployment

Firepit is production-ready with:

✅ **Security Hardening**

- Global error boundaries
- Rate limiting on uploads and API endpoints
- Secure session management
- Input validation and sanitization

✅ **Performance Optimization**

- **90%+ improvement in first load times** (from 30+ seconds to 2-3 seconds)
- **85% faster First Contentful Paint** (8s → 0.8-1.2s)
- **50% smaller bundle size** (2.5MB → 800KB-1.2MB)
- Response compression (60-70% bandwidth reduction)
- Virtual scrolling for large lists
- Optimized bundle size with code splitting
- Partial Prerendering (PPR) for instant page loads
- Aggressive caching for repeat visits (~100ms)

✅ **Monitoring & Observability**

- New Relic APM integration
- Comprehensive error tracking
- Performance metrics
- Audit logging

✅ **Testing & Quality**

- 2271 passing tests
- Comprehensive test coverage
- Automated CI/CD pipeline
- Strict ESLint configuration

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment instructions.

## ⚠️ Known Limitations

Firepit still has meaningful Discord parity gaps in a few areas:

- Richer community/server organization beyond categories, such as server templates, onboarding screens, and announcement-style surfaces, is still in progress
- Notification-center, unread-management, and digest-style attention flows are still incomplete
- Voice/video calls and screen sharing are not implemented
- Bots, slash commands, and webhooks are not implemented
- Native mobile apps are not implemented, though PWA support exists

See [ROADMAP.md](./ROADMAP.md) for the complete feature roadmap.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development workflow
- Code style guidelines
- Testing requirements
- Pull request process
- Issue reporting templates

## 🗂️ Project Structure

```
firepit/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utility functions and Appwrite integration
│   └── __tests__/        # Vitest test suites
├── scripts/
│   ├── setup-appwrite.ts    # Database initialization script
│   └── validate-env.ts      # Environment validation script
├── public/               # Static assets
├── DEPLOYMENT.md         # Deployment documentation
└── .env.local.example    # Environment variable template
```

## 🛠️ Available Scripts

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `bun dev`               | Start development server (with Turbopack)    |
| `bun build`             | Build for production                         |
| `bun start`             | Start production server                      |
| `bun run test`          | Run all tests with Vitest                    |
| `bun run test:coverage` | Run tests with coverage report               |
| `bun lint`              | Check code with ESLint                       |
| `bun lint:fix`          | Fix auto-fixable linting issues              |
| `bun validate-env`      | Validate environment configuration           |
| `bun setup`             | Initialize Appwrite database and collections |

## 🔧 Configuration

### Environment Variables

The application requires several environment variables. Copy `.env.local.example` to `.env.local` and configure:

- `APPWRITE_ENDPOINT` - Your Appwrite API endpoint
- `APPWRITE_PROJECT_ID` - Your Appwrite project ID
- `APPWRITE_API_KEY` - Server-side API key with full permissions
- `SYSTEM_SENDER_USER_ID` - Optional Appwrite user ID of the dedicated system announcement sender.
    Used for system announcement threads in DMs.
    Set this in production to the user's `$id` from Appwrite Console -> Auth -> Users.
    When unset, announcement threads are read-only.
    See DEPLOYMENT.md for details.

For a complete list and detailed explanations, see [DEPLOYMENT.md](./DEPLOYMENT.md#2-environment-configuration).

### First-Time Setup

1. **Create an Appwrite account and project** at [appwrite.io](https://appwrite.io)
2. **Generate an API key** with required scopes (see DEPLOYMENT.md)
3. **Configure environment variables** in `.env.local`
4. **Run validation**: `bun run validate-env`
5. **Initialize database**: `bun run setup`
6. **Start the app**: `bun dev`
7. **Create your account** in the UI
8. **Make yourself admin** by setting `APPWRITE_ADMIN_USER_IDS` in `.env.local`

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 🐛 Troubleshooting

### Common Issues

- **"Appwrite endpoint not configured"** - Check your `.env.local` file exists and has the correct values
- **"Project not found"** - Verify your `APPWRITE_PROJECT_ID` matches your Appwrite Console
- **"Missing scope" errors** - Regenerate your API key with all required permissions
- **Setup script fails** - Ensure your API key has databases, collections, attributes, and indexes permissions
- **Setup script reports an attribute limit on `notification_settings`** - Update to the latest code and rerun `bun run setup`; unread persistence now uses a dedicated `thread_reads` collection instead of adding another notification-settings attribute

For more solutions, see [DEPLOYMENT.md - Troubleshooting](./DEPLOYMENT.md#troubleshooting).

## 🧪 Testing

This project maintains a comprehensive test suite with 100% pass rate:

```bash
# Run all tests
bun run test

# Run tests with coverage report
bun run test:coverage

# Run tests in watch mode (during development)
bun run test --watch
```

Current test coverage: **50.02%** lines (growing, **34961/69881**)

- 2271 tests passing across 203 test suites
- Comprehensive API route testing (44 new tests for invite system)
- Focus on security-critical modules (auth, roles, moderation), and modules critical for function (API routes, hooks, utility files, etc.)

## 📦 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables from `.env.local`
4. Deploy!

### Self-Hosted

```bash
# Build the application
bun build

# Start production server
bun start
```

For production deployment with Nginx, Docker, or other platforms, see [DEPLOYMENT.md - Production Deployment](./DEPLOYMENT.md#production-deployment).

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development workflow
- Code style guidelines
- Testing requirements
- Pull request process
- Issue reporting templates

## 📄 License

firepit, a realtime chat app
Copyright (C) 2026 August (acarlson33)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

Licensed under the GNU General Public License (GPL) v3.
You can find the License here: [License](./LICENSE)

## 🙏 Acknowledgments

Built with:

- [Next.js](https://nextjs.org/)
- [Appwrite](https://appwrite.io/)
- [TailwindCSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vitest](https://vitest.dev/)

## 📧 Support

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/firepit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/firepit/discussions)
