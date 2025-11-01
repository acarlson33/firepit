# New Relic Integration Guide

This application is fully instrumented with New Relic for comprehensive monitoring, logging, and error tracking.

## Features

✅ **Application Performance Monitoring (APM)** - Monitor server-side performance  
✅ **Error Tracking** - Automatic error capture and analysis  
✅ **Transaction Tracing** - Detailed transaction breakdown  
✅ **Distributed Tracing** - Track requests across services  
✅ **Application Logging** - Forward logs to New Relic  
✅ **Custom Events** - Track business metrics  
✅ **Custom Metrics** - Performance counters  
✅ **Browser Monitoring (RUM)** - Real User Monitoring (optional)

## Setup

### 1. Get New Relic Credentials

1. Sign up for a New Relic account at https://newrelic.com
2. Navigate to: **Account Settings** → **API Keys** → **License Keys**
3. Copy your license key
4. Choose an application name (e.g., `firepit-production`, `firepit-staging`)

### 2. Configure Environment Variables

Add the following to your `.env.local` file:

```bash
# New Relic APM Configuration
NEW_RELIC_LICENSE_KEY=your-license-key-here
NEW_RELIC_APP_NAME=firepit-production
```

**Important:** Do NOT use the `NEXT_PUBLIC_` prefix. These variables must remain server-side only.

### 3. Verify Setup

Start your application:

```bash
bun dev
```

You should see comprehensive log messages in the console:

```
[New Relic] Initialized for app: firepit-production
[New Relic] Configuration loaded from newrelic.cjs
[New Relic] Features enabled:
  - Application Performance Monitoring (APM)
  - Error Tracking
  - Transaction Tracing
  - Distributed Tracing
  - Application Logging
  - Custom Events and Metrics
  - Browser Monitoring (RUM)
```

If you don't see this message, check that:

-   Both environment variables are set
-   The values are correct
-   You've restarted your application after adding the variables

## Deployment

### Vercel

1. Go to your project settings in Vercel
2. Navigate to **Settings** → **Environment Variables**
3. Add:
    - `NEW_RELIC_LICENSE_KEY` = your license key
    - `NEW_RELIC_APP_NAME` = your app name
4. Redeploy your application

### Other Platforms

Set the environment variables according to your platform's documentation:

-   **Railway**: Environment Variables in Settings
-   **Render**: Environment Variables in Dashboard
-   **Docker**: Use `-e` flag or `.env` file
-   **Kubernetes**: ConfigMaps or Secrets

## Configuration

### Configuration File

The application uses `newrelic.cjs` for comprehensive configuration including:

-   **Log levels and forwarding** - Send application logs to New Relic
-   **Error collection** - Capture and analyze errors
-   **Transaction tracing** - Detailed performance traces
-   **Distributed tracing** - Track requests across services
-   **Browser monitoring** - Real User Monitoring (RUM)
-   **Custom naming rules** - Organize transactions

See `newrelic.cjs` for the full configuration.

### Environment Variables

Additional New Relic settings can be configured:

-   `NEW_RELIC_LOG_LEVEL` - Set log level (`info`, `debug`, `warn`, `error`)
-   `NEW_RELIC_DISTRIBUTED_TRACING_ENABLED` - Enable distributed tracing (default: `true`)
-   `NODE_ENV` - Set to `production` for production logging

See [New Relic Node.js Agent Configuration](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/) for all available options.

## Usage

### Automatic Instrumentation

New Relic automatically instruments:

-   ✅ HTTP requests and responses
-   ✅ Database queries
-   ✅ External API calls
-   ✅ Next.js routes
-   ✅ Middleware

### Manual Instrumentation

Import utilities from `@/lib/newrelic-utils`:

#### Logging

```typescript
import { logger } from "@/lib/newrelic-utils";

logger.debug("Debug message", { key: "value" });
logger.info("Info message", { userId: "123" });
logger.warn("Warning message", { issue: "something" });
logger.error("Error message", { error: "details" });
```

#### Error Tracking

```typescript
import { recordError } from "@/lib/newrelic-utils";

try {
    // Your code
} catch (error) {
    recordError(error, {
        context: "user-action",
        userId: "123",
    });
}
```

#### Custom Events

```typescript
import { recordEvent } from "@/lib/newrelic-utils";

recordEvent("UserPurchase", {
    userId: "123",
    amount: 99.99,
    product: "premium",
});
```

#### Performance Tracking

```typescript
import { measureAsync, trackTiming } from "@/lib/newrelic-utils";

// Automatically track async function execution time
const result = await measureAsync(
    "database-query",
    async () => {
        return await db.query("SELECT * FROM users");
    },
    { query: "select-users" }
);
```

#### API Call Tracking

```typescript
import { trackApiCall } from "@/lib/newrelic-utils";

const start = Date.now();
const response = await fetch("/api/users");
const duration = Date.now() - start;

trackApiCall("/api/users", "GET", response.status, duration);
```

#### Database Query Tracking

```typescript
import { trackDatabaseQuery } from "@/lib/newrelic-utils";

const start = Date.now();
const results = await db.listDocuments("users", queries);
const duration = Date.now() - start;

trackDatabaseQuery("listDocuments", "users", duration, results.total);
```

#### Authentication Tracking

```typescript
import { trackAuth } from "@/lib/newrelic-utils";

trackAuth("login", userId, { method: "email" });
trackAuth("signup", userId, { plan: "free" });
trackAuth("failed", undefined, { reason: "invalid-password" });
```

#### Message Tracking

```typescript
import { trackMessage } from "@/lib/newrelic-utils";

trackMessage("sent", "channel", {
    serverId: "123",
    channelId: "456",
});
```

### Example API Route

See `src/app/api/example-newrelic/route.ts` for a complete example:

```typescript
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
} from "@/lib/newrelic-utils";

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/example");
        logger.info("Processing request");

        const result = await measureAsync("operation", async () => {
            // Your work here
        });

        trackApiCall("/api/example", "GET", 200, Date.now() - startTime);
        return NextResponse.json(result);
    } catch (error) {
        recordError(error);
        trackApiCall("/api/example", "GET", 500, Date.now() - startTime);
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}
```

## Monitoring Features

Once enabled, New Relic will automatically monitor:

-   ✅ Request/response times
-   ✅ Database queries (via Appwrite)
-   ✅ External HTTP calls
-   ✅ Memory usage
-   ✅ CPU usage
-   ✅ Error rates and stack traces
-   ✅ Custom transactions
-   ✅ Log ingestion

## Viewing Data in New Relic

1. **APM & Services** → Your app name → Performance overview
2. **Logs** → Application logs with full context
3. **Errors** → Error analytics and stack traces
4. **Distributed Tracing** → Request traces across services
5. **Events** → Query custom events (`ApplicationLog`, `ApiCall`, `UserAction`, etc.)
6. **Metrics** → Custom metrics and counters

### NRQL Query Examples

```sql
-- Application logs
SELECT * FROM ApplicationLog WHERE level = 'error' SINCE 1 hour ago

-- API calls
SELECT average(duration), count(*) FROM ApiCall
WHERE endpoint = '/api/users'
FACET method, statusCode
SINCE 1 day ago

-- User actions
SELECT count(*) FROM UserAction
FACET action
SINCE 1 day ago

-- Database queries
SELECT average(duration), count(*) FROM DatabaseQuery
FACET collection, operation
SINCE 1 hour ago

-- Authentication events
SELECT count(*) FROM Authentication
FACET action
TIMESERIES
SINCE 1 day ago
```

## Best Practices

1. **Always set transaction names** for API routes
2. **Add context attributes** to transactions and errors
3. **Use structured logging** instead of console.log
4. **Track business metrics** with custom events
5. **Measure slow operations** with timing functions
6. **Don't log sensitive data** (passwords, tokens, etc.)
7. **Use appropriate log levels** (debug in dev, info in prod)

## Troubleshooting

### New Relic not loading

Check:

1. Environment variables are set correctly in `.env.local`
2. License key is valid
3. App name is configured
4. Instrumentation hook is enabled in `next.config.ts` (`instrumentationHook: true`)
5. Application has been restarted after adding env vars

### No data appearing

Check:

1. New Relic agent is initialized (check logs on startup for init message)
2. Data may take 1-2 minutes to appear in New Relic UI
3. Check New Relic One status page for outages
4. Verify network connectivity to New Relic endpoints

### Console warnings

If you see warnings about New Relic not being configured, this is expected in development when you don't have a license key set. The app will work fine without New Relic - it gracefully degrades.

### Application fails to start

-   The integration is designed to never block application startup
-   Check console for warning or error messages
-   Verify the New Relic package is installed: `bun pm ls newrelic`

### Edge runtime compatibility

The instrumentation only runs on the Node.js runtime. Edge runtime routes will not be monitored by New Relic. This is by design.

## Testing

Tests for the New Relic integration are located in:

-   `src/__tests__/instrumentation.test.ts`

Run tests:

```bash
bun run test src/__tests__/instrumentation.test.ts
```

## Resources

-   [New Relic Node.js Agent](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/)
-   [NRQL Query Language](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/)
-   [Custom Events](https://docs.newrelic.com/docs/data-apis/custom-data/custom-events/)
-   [Custom Metrics](https://docs.newrelic.com/docs/data-apis/custom-data/custom-metrics/)
-   [Application Logging](https://docs.newrelic.com/docs/logs/logs-context/configure-logs-context-nodejs/)

## Security

-   ✅ License keys are never exposed to the browser
-   ✅ All monitoring is server-side only
-   ✅ No `NEXT_PUBLIC_` prefix used
-   ✅ Environment variables remain secure
-   ✅ Credentials are only accessible to server-side code

## Additional Resources

-   [New Relic APM Documentation](https://docs.newrelic.com/docs/apm/)
-   [Node.js Agent Guide](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/)
-   [Next.js Instrumentation Hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
