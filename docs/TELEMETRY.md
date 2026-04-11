# Telemetry Providers

Firepit supports telemetry routing to New Relic, PostHog, both, or neither.

This is implemented in:

- Server telemetry helpers: `src/lib/newrelic-utils.ts`
- Client telemetry helpers: `src/lib/client-telemetry.ts`

## Provider Configuration

### Server-side provider

- Env var: `TELEMETRY_PROVIDER`
- Allowed values: `newrelic`, `posthog`, `both`, `none`
- Default: `newrelic`

### Client-side provider

- Env var: `NEXT_PUBLIC_TELEMETRY_PROVIDER`
- Allowed values: `newrelic`, `posthog`, `both`, `none`
- Default: `newrelic`

## Credentials

### New Relic

- `NEW_RELIC_LICENSE_KEY`
- `NEW_RELIC_APP_NAME`

### PostHog

Server-side capture (`posthog-node`) prefers:

- `POSTHOG_PROJECT_API_KEY`
- `POSTHOG_HOST`

Fallback compatibility keys:

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

Client-side capture (`posthog-js`) uses existing browser initialization in `instrumentation-client.ts`.

## PostHog Privacy And Bandwidth Controls

Client-side PostHog behavior is configured by these env vars:

- `NEXT_PUBLIC_POSTHOG_AUTOCAPTURE` (recommended `false`)
- `NEXT_PUBLIC_POSTHOG_SESSION_RECORDING` (recommended `false`)
- `NEXT_PUBLIC_POSTHOG_CAPTURE_PAGEVIEW` (recommended `true`)
- `NEXT_PUBLIC_POSTHOG_REQUEST_BATCHING` (recommended `true`)

These defaults reduce ingestion frequency and prevent automatic UI text capture
from clicks (for example DM display names on buttons).

## PostHog Error Tracking

Firepit captures client exceptions for PostHog error tracking via:

- `capture_exceptions` in client PostHog initialization
- `posthog.captureException(...)` in explicit client error paths

To enable readable (symbolicated) production stack traces in PostHog, configure
Next.js source map upload with these env vars:

- `POSTHOG_PROJECT_ID`
- `POSTHOG_API_KEY` (personal API key)
- optional `POSTHOG_HOST` (defaults to US PostHog host)

When `POSTHOG_PROJECT_ID` and `POSTHOG_API_KEY` are present, `next.config.ts`
automatically enables PostHog source map uploads during production builds.

## Message Lifecycle Events

Server routes emit explicit message lifecycle events:

- `message_sent`
- `message_edited`
- `message_deleted`

Event payloads intentionally exclude message content and include only metadata:

- `actorUserId`
- `messageType` (`channel` or `dm`)
- contextual IDs (`channelId` or `conversationId`, `messageId`, optional `serverId`)
- `totalQueryTimeMs`

## Optional Next.js Rewrite Configuration

If you use Next.js rewrites as a PostHog proxy path, configure:

- `POSTHOG_REWRITE_ENABLED` (default `true`)
- `POSTHOG_REWRITE_PATH` (default `/ingest`)
- `POSTHOG_REWRITE_INGEST_HOST` (default `https://us.i.posthog.com`)
- `POSTHOG_REWRITE_STATIC_HOST` (default `https://us-assets.i.posthog.com`)

If you set `NEXT_PUBLIC_POSTHOG_HOST` directly to your own reverse-proxy domain,
you can disable rewrites with `POSTHOG_REWRITE_ENABLED=false`.

## Telemetry Matrix

### Server helper mapping

| Helper                               | New Relic output                           | PostHog output                                                                     |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `recordEvent(eventType, attributes)` | `recordCustomEvent(eventType, attributes)` | capture event `eventType` with `attributes`                                        |
| `recordMetric(name, value)`          | `recordMetric(name, value)`                | capture event `metric_recorded` with `{ metricName: name, value }`                 |
| `incrementMetric(name, value)`       | `incrementMetric(name, value)`             | capture event `metric_incremented` with `{ metricName: name, incrementBy: value }` |
| `recordError(error, attrs)`          | `noticeError(error, attrs)`                | capture event `error_recorded` with normalized error fields plus attrs             |
| `logger.info/warn/error/debug`       | `ApplicationLog` custom event              | capture event `application_log`                                                    |

### Client helper mapping

| Helper                                   | New Relic output                    | PostHog output                                                                   |
| ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `recordClientAction(action, attributes)` | `addPageAction(action, attributes)` | `capture(action, attributes)`                                                    |
| `recordClientError(error, attributes)`   | `noticeError(error, attributes)`    | `captureException(error, attributes)` or fallback `capture("client_error", ...)` |

## Digest Telemetry Example

Digest generation in `src/lib/inbox.ts` emits:

- Metric: `Custom/InboxDigest/DurationMs`
- Metric: `Custom/InboxDigest/ReturnedItems`
- Metric: `Custom/InboxDigest/TotalUnread`
- Event: `InboxDigestGenerated`

Under provider routing:

- `newrelic`: only New Relic receives these
- `posthog`: only PostHog receives mapped equivalents
- `both`: both providers receive telemetry
- `none`: no provider receives telemetry

## Client Parity Coverage

The following client paths now route through provider-aware helpers instead of direct New Relic-only calls:

- `src/lib/client-logger.ts`
- `src/app/error.tsx`
- `src/app/global-error.tsx`
