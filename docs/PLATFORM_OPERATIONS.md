# Platform Operations

## Runtime Stack

Firepit currently runs on:

- Next.js 16.1.x
- React 19.2.x
- Bun 1.3.x for package management and scripts
- Appwrite for auth, database, storage, and realtime
- New Relic for monitoring and instrumentation

## Performance Strategy

The application performance model is based on a few stable principles rather than one-off tuning notes.

Key optimizations in the current stack:

- Turbopack in development and tuned bundle splitting for production builds
- React Query caching and stale-while-revalidate patterns
- virtualized message lists for large chat histories
- deferred or pooled realtime subscriptions
- static asset caching and service worker support
- image optimization and remote image allowlists
- HTTP compression for large JSON responses where appropriate

## Service Worker And Caching

The app ships a service worker from the public asset layer. The overall intent is:

- fast repeat visits
- resilient static asset delivery
- offline-aware navigation and API fallback behavior
- a base for future background sync and notification work

Cache behavior should be documented in terms of strategy and user impact, not long temporary benchmark writeups.

## Monitoring And Diagnostics

New Relic is the primary observability integration.

The codebase already instruments:

- API routes
- message operations
- authentication paths
- error recording
- custom transaction attributes and events

Operational guidance:

- keep secrets out of client-exposed Next.js config
- prefer structured attributes over ad hoc log strings
- treat debug and test endpoints as internal diagnostics, not public API surface
- monitor `thread_reads.reads` payload growth per context; `setupThreadReads` configures this attribute in the `thread_reads` collection with a ~65KB cap, so alert on sustained high utilization (for example, 80%+ of configured size)

## Releases And Versioning

Builds generate version metadata during the build step. The application exposes runtime version information through `/api/version`, which makes it possible to correlate deployed behavior with a specific build.

Use versioning for:

- release verification
- canary visibility
- support debugging
- monitoring correlation

## Environment And Configuration Notes

- Next.js typed routes and the React compiler are enabled.
- `cacheComponents` is enabled under Next.js 16.
- Public Appwrite endpoint and project identifiers are mapped into `NEXT_PUBLIC_*` values without exposing server secrets.
- Production removes most console calls but preserves warnings and errors.

## Documentation Cleanup Policy

Avoid adding temporary markdown files for:

- session summaries
- one-off test fix recaps
- completed feature announcements
- exploratory optimization scratch notes

If the information still matters after implementation, fold it into one of the maintained section docs instead.
