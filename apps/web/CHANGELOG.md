# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-08-15

### 🐛 Fixes

- **Offline banner** - When your connection drops, a clear banner now appears instead of requests failing silently
- **More reliable API handling** - Reworked response parsing and error handling across API routes for consistent, clearer error messages

### ⚙️ Improvements

- **Connectivity-aware loading** - Screens show clearer loading states while data fetches
- **Faster profile loads** - Improved profile prefetching so profiles appear sooner
- **Better observability** - Added New Relic instrumentation for faster monitoring and issue diagnosis
- **Stronger reliability** - Added integration tests for auth/session and core API routes to prevent regressions

## [2.0.0] - 2026-05-21

### ✨ Features

- **Monorepo migration** - Split the project into `apps/web` and `apps/mobile` workspaces with shared tooling
- **Mobile-ready APIs** - Added and reworked endpoints (message listing, sessions) to power the React Native app
- **Improved auth sessions** - Session handling changes to reduce unnecessary re-authentication

### Build and Infrastructure

- **Web CI** - GitHub Actions for web build and test
- **PostHog logging** - Enhanced event logging across API routes
- **Repo Relocation** - Relocate Repo to new github organization for future work.

### Bug Fixes

- Various API bugs surfaced during the mobile build-out

## [1.9.0] - 2026-05-13

### ✨ Features

- **UI overhaul** - Redesigned and polished core chat UI
- **Faster DM loading** - Performance improvements in direct message loading
- **Realtime improvements** - Better subscription lifecycle management
- **Cursor-based pagination** - Public server listing now paginates with cursors

### Build and Infrastructure

- **Mobile app prerequisites** - API groundwork for the upcoming mobile app

### Bug Fixes

- **Rate limit & CORS handling** - Improved middleware error handling and response management

## [1.8.1] - 2026-05-06

### Bug Fixes

- Updated dependencies to latest versions for improved stability and performance

## [1.8.0] - 2026-05-05

### ✨ Features

- **GIF & sticker support** - Share GIFs and stickers with improved file naming and MIME type inference
- **System announcements** - Instance-wide announcements with dispatching and caching
- **Email verification** - Verify email addresses during and after signup
- **Polls in messages** - Create and vote on polls in channels
- **Server discovery & customization** - Improved public server browsing and customization
- **Markdown support** - Basic Markdown rendering in messages
- **Channel deletion** - Delete channels with proper permission and error handling

### Bug Fixes

- **Notification settings cache invalidation** - Fixed stale notification preferences
- **Conversation caching** - Fixed duplicate idempotency key handling and improved DM caching
- Various error-handling and API response structure improvements

## [1.7.0] - 2026-03-29

### ⚠️ Breaking Changes

- **Node.js 20.9.0 minimum** - Enforced via the engines field in package.json.
- **Next.js 16.2.x** - Updated Next.js ecosystem packages; align your app/runtime and CI accordingly.
- **Appwrite TablesDB** - Added TablesDB client for transaction support (notably report resolution flow), which may affect Appwrite API behavior assumptions in custom integrations.

### ✨ Features

#### Profile Backgrounds and Avatar Frames

- **Custom profile backgrounds** - Solid colors, gradients, or uploaded images with a 24-hour cooldown per user
- **Preset avatar frames** - Seasonal and themed frames with admin-configurable assets
- **Profile appearance settings** - In-app UI for selecting backgrounds, frames, and previewing changes

#### User Reporting System

- **Report users** - Report users for inappropriate profile content with required justification
- **Admin reports dashboard** - Instance admins can review, resolve, or dismiss reports with audit logging
- **Rate limiting** - DB-backed rate limiting prevents report spam (5 per hour per user)
- **Atomic report resolution** - Transaction-based resolution prevents double-processing of reports

#### Onboarding Improvements

- **Safe form validation** - Type-guarded formData parsing with proper fallbacks
- **Notification settings** - Onboarding now correctly sets notification preferences

### Build and Infrastructure

- **Runtime/tooling alignment** - CI and production runtime checks now enforce the upgraded framework/runtime baseline
- **Transaction-backed moderation flow** - Report resolution path now uses Appwrite transactions to prevent double-processing

### Bug Fixes

- **Profile background clearing** - Fixed clearing not working for color/gradient backgrounds
- **Background type switching** - Fixed image file ID not being cleared when switching to color/gradient
- **Moderation toast grammar** - Fixed "Successfully kickned" → "Successfully kicked"
- **Fixed upload endpoints leaking raw exceptions to clients** - Generic error messages returned to clients instead of raw exceptions
- **File ownership on delete** - Upload delete endpoints now verify file ownership before deletion
- **Inbox query fix** - Fixed `Query.equal` on array attribute `participants` → `Query.contains`
- **PostHog deduplication** - Removed duplicate initialization in `instrumentation-client.ts` and the PostHog provider component to prevent "already initialized" warnings

## [1.0.0] - 2025-11-02

### 🎉 Initial Release

Firepit 1.0.0 is the first production-ready release of our Discord-inspired chat platform built with Next.js 15, Appwrite, and modern web technologies.

### ✨ Features

#### Core Chat Functionality

- **Real-time Messaging** - WebSocket-based instant messaging with typing indicators
- **Server & Channel System** - Discord-like server organization with multiple text channels
- **Direct Messages** - Private 1-on-1 conversations between users
- **Message Replies** - Thread-style replies to maintain conversation context
- **Message Reactions** - React to messages with standard and custom emojis
- **Message Search** - Full-text search across channels and DMs with advanced filters
- **@Mentions** - Mention users in messages with autocomplete support

#### User Management

- **User Profiles** - Customizable profiles with avatar upload support
- **User Status** - Online/offline/away/DND presence with custom status messages
- **Authentication** - Secure email/password authentication via Appwrite

#### Moderation & Administration

- **Role-Based Permissions** - Server-specific roles with granular permissions
- **Channel Permissions** - Per-channel permission overrides for roles and users
- **Message Moderation** - Soft delete, restore, and hard delete with full audit trails
- **User Moderation** - Kick, ban, and timeout features for server administrators
- **Audit Logging** - Complete audit trail of all moderation actions

#### Media & Customization

- **Image Uploads** - Share images in channels and DMs (up to 10MB)
- **File Attachments** - Upload and share files (up to 50MB)
- **Custom Emojis** - Upload server-specific custom emojis (up to 10MB)
- **Emoji Picker** - Searchable emoji picker with standard and custom emoji support

#### Performance & Developer Experience

- **99.3%+ Performance Improvement** - Optimized bundle size, caching, and rendering
- **Virtual Scrolling** - Efficient rendering of large message lists
- **Response Compression** - 60-70% bandwidth reduction on large payloads
- **Debounced Typing Indicators** - 70-80% reduction in typing status updates
- **Turbopack Support** - 87% faster development, 49% faster production builds
- **PWA Ready** - Progressive Web App support with offline capabilities
- **Service Worker** - Multi-tier caching strategy for optimal performance

#### Infrastructure & Monitoring

- **New Relic APM** - Full application performance monitoring and error tracking
- **OpenAPI 3.1.0 Documentation** - Complete API documentation with 20+ endpoints
- **Comprehensive Testing** - 992 passing tests with extensive coverage
- **CI/CD Pipeline** - Automated testing and builds via GitHub Actions
- **TypeScript** - Full type safety across the entire codebase
- **ESLint Configuration** - Strict linting with accessibility, performance, and React best practices

### 🏗️ Technical Stack

- **Frontend**: Next.js 15.5.6 (App Router), React 18, TailwindCSS 4.1, shadcn/ui
- **Backend**: Appwrite 20.x (Database, Auth, Storage, Realtime)
- **State Management**: React Query (TanStack Query) with optimistic updates
- **Styling**: TailwindCSS with custom theme system
- **Testing**: Vitest with Testing Library
- **Build Tool**: Turbopack (default), Webpack (fallback)
- **Runtime**: Bun 1.3.0 (recommended), Node.js 18+ (supported)

### 🔒 Security

- Global error boundaries for graceful error recovery
- Rate limiting on file uploads and API endpoints
- Secure session management with HTTP-only cookies
- Input validation and sanitization across all forms
- CSRF protection on all state-changing operations
- Comprehensive permission checks on all routes

### 📚 Documentation

- Complete deployment guide (DEPLOYMENT.md)
- Performance optimization documentation (PERFORMANCE.md)
- Turbopack configuration guide (TURBOPACK_CONFIG.md)
- New Relic integration guide (NEW_RELIC.md)
- Admin and moderator handbook (ADMIN_GUIDE.md)
- Contributing guidelines (CONTRIBUTING.md)
- Detailed roadmap (ROADMAP.md)

### 🎯 Known Limitations

- Server invites not yet implemented (planned for v1.1)
- Message threading not yet implemented (planned for v1.2)
- Message pinning not yet implemented (planned for v1.2)
- Voice/video calls not supported
- Mobile apps not yet available (PWA supported)

### 🚀 Performance Metrics

- **Bundle Size**: Optimized with code splitting and tree shaking
- **Load Time**: <2s on 3G connections
- **Time to Interactive**: <3s average
- **Real-time Latency**: <200ms for message delivery
- **Development Build**: 87% faster with Turbopack
- **Production Build**: 49% faster with Turbopack
- **Memory Usage**: 56% reduction in development

### 🙏 Acknowledgments

Built with ❤️ using:

- Next.js by Vercel
- Appwrite for backend services
- shadcn/ui for beautiful components
- TailwindCSS for styling
- React Query for state management
- Vitest for testing

[2.0.3]: https://github.com/firepit-chat/firepit/releases/tag/v2.0.3
[2.0.0]: https://github.com/firepit-chat/firepit/releases/tag/v2.0.0
[1.9.0]: https://github.com/acarlson33/firepit/releases/tag/v1.9.0
[1.8.1]: https://github.com/acarlson33/firepit/releases/tag/v1.8.1
[1.8.0]: https://github.com/acarlson33/firepit/releases/tag/v1.8.0
[1.7.0]: https://github.com/acarlson33/firepit/releases/tag/v1.7.0
[1.0.0]: https://github.com/acarlson33/firepit/releases/tag/v1.0.0
