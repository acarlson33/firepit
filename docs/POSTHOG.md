# PostHog Integration Guide

This guide covers the PostHog analytics and monitoring setup for Firepit.

## Overview

PostHog provides comprehensive product analytics, session recording, feature flags, A/B testing, and error tracking - all in one platform.

## Features Enabled

-   **Product Analytics** - Track user behavior, retention, and engagement
-   **Session Recording** - Watch real user sessions to identify UX issues
-   **Feature Flags** - Roll out features gradually with targeting
-   **A/B Testing** - Run experiments to optimize user experience
-   **Error Tracking** - Automatic exception capture and alerting
-   **Heatmaps** - Visualize where users click and scroll
-   **Surveys** - Collect user feedback in-app

## Setup

### 1. Get PostHog Credentials

You already have PostHog set up! Your project details:

-   **Project**: firepit-qpc
-   **Project ID**: 254192
-   **Region**: US

### 2. Environment Variables

Your `.env.local` should have:

```bash
# PostHog Configuration
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key-here
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

The `NEXT_PUBLIC_` prefix allows PostHog to work on both client and server side.

### 3. Verify Installation

PostHog is already installed in your `package.json`:

```json
{
    "dependencies": {
        "posthog-js": "^1.298.0",
        "posthog-node": "^5.14.0"
    }
}
```

## Usage

### Server-Side (API Routes, Server Components, Server Actions)

```typescript
import {
    logger,
    recordError,
    recordEvent,
    trackApiCall,
    setTransactionName,
    addTransactionAttributes,
} from "@/lib/posthog-utils";

// Logging
logger.info("User logged in", { userId: "user-123" });
logger.error("Failed to process payment", { orderId: "order-456" });

// Error Tracking
try {
    await riskyOperation();
} catch (error) {
    recordError(error, { userId: "user-123", context: "payment" });
}

// Custom Events
recordEvent("message_sent", {
    userId: "user-123",
    channelId: "channel-456",
    messageLength: 50,
});

// API Monitoring
const startTime = Date.now();
// ... handle request ...
trackApiCall("/api/messages", "POST", 200, Date.now() - startTime, {
    userId: "user-123",
});

// Transaction Tracking
setTransactionName("POST /api/messages");
addTransactionAttributes({
    userId: "user-123",
    channelId: "channel-456",
});
```

### Client-Side (React Components)

PostHog is automatically initialized via `instrumentation-client.ts`.

```typescript
import { usePostHog } from "posthog-js/react";

function MyComponent() {
    const posthog = usePostHog();

    const handleClick = () => {
        // Track custom event
        posthog?.capture("button_clicked", {
            button_name: "send_message",
            location: "chat_page",
        });
    };

    return <button onClick={handleClick}>Send</button>;
}
```

### User Identification

```typescript
import { identifyUser, setUserProperties } from "@/lib/posthog-utils";

// After login
identifyUser("user-123", {
    email: "user@example.com",
    name: "John Doe",
    plan: "premium",
    signupDate: "2024-01-15",
});

// Update user properties
setUserProperties("user-123", {
    lastActive: new Date().toISOString(),
    messageCount: 150,
});
```

### Feature Flags

```typescript
import { useFeatureFlagEnabled } from "posthog-js/react";

function NewFeature() {
    const showNewUI = useFeatureFlagEnabled("new-chat-ui");

    if (!showNewUI) {
        return <LegacyUI />;
    }

    return <NewUI />;
}
```

Server-side feature flags:

```typescript
import { getPostHog } from "@/lib/posthog-utils";

async function checkFeatureFlag(userId: string, flagKey: string) {
    const posthog = getPostHog();
    if (!posthog) return false;

    return await posthog.isFeatureEnabled(flagKey, userId);
}
```

### Performance Monitoring

```typescript
import { startTimer } from "@/lib/posthog-utils";

async function expensiveOperation(userId: string) {
    const timer = startTimer("expensive_operation", userId);

    try {
        await doSomethingExpensive();
    } finally {
        timer.end({ success: true });
    }
}
```

### Session Recording

Session recording is automatically enabled with:

```typescript
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    capture_exceptions: true,
    session_recording: {
        // Recordings are captured by default
        maskAllInputs: false, // Mask sensitive inputs
        maskAllText: false, // Mask all text
    },
});
```

## Dashboard Setup

### Recommended Dashboards

1. **User Engagement**

    - Daily/Weekly/Monthly Active Users
    - Retention cohorts
    - Session duration
    - Pages per session

2. **Chat Performance**

    - Messages sent per day
    - Average response time
    - Channel activity
    - Most active users

3. **Error Monitoring**

    - Error rate trends
    - Most common errors
    - Affected users
    - Error by endpoint

4. **Feature Adoption**
    - Feature usage over time
    - User segments using features
    - Conversion funnels

### Creating Insights

Use the PostHog MCP server for programmatic insight creation:

```typescript
// Example: Track daily message count
const insight = await createInsight({
    name: "Daily Messages Sent",
    query: {
        kind: "TrendsQuery",
        series: [
            {
                kind: "EventsNode",
                event: "message_sent",
                math: "total",
            },
        ],
        interval: "day",
        dateRange: {
            date_from: "-30d",
            date_to: null,
        },
    },
});
```

## Best Practices

### 1. Event Naming

Use consistent naming conventions:

-   **snake_case** for event names: `message_sent`, `user_login`
-   **lowercase** for properties: `user_id`, `channel_id`
-   Prefix system events with `$`: `$pageview`, `$exception`

### 2. User Privacy

-   Don't send PII (passwords, tokens) in event properties
-   Use hashed IDs for sensitive identifiers
-   Configure session recording masks for sensitive fields

### 3. Performance

-   Batch events when possible
-   Use `posthog.shutdown()` on app termination
-   Avoid tracking in hot code paths (use sampling)

### 4. Testing

-   Use separate PostHog projects for dev/staging/production
-   Disable PostHog in tests:

```typescript
// In test setup
vi.mock("@/lib/posthog-utils", () => ({
    logger: { info: vi.fn(), error: vi.fn() },
    recordError: vi.fn(),
    recordEvent: vi.fn(),
    // ... other mocks
}));
```

## Migration from New Relic

The PostHog utilities API is designed to be compatible with the previous New Relic implementation:

| New Relic                    | PostHog                      | Notes       |
| ---------------------------- | ---------------------------- | ----------- |
| `logger.info()`              | `logger.info()`              | ✅ Same API |
| `recordError()`              | `recordError()`              | ✅ Same API |
| `recordEvent()`              | `recordEvent()`              | ✅ Same API |
| `recordMetric()`             | `recordMetric()`             | ✅ Same API |
| `setTransactionName()`       | `setTransactionName()`       | ✅ Same API |
| `addTransactionAttributes()` | `addTransactionAttributes()` | ✅ Same API |

Additional PostHog features:

-   `identifyUser()` - Associate events with users
-   `trackFeatureFlag()` - Track feature flag usage
-   `groupUser()` - Group users for B2B analytics
-   `startTimer()` - Performance timing utilities

## Troubleshooting

### Events not appearing

1. **Check API key**: Verify `NEXT_PUBLIC_POSTHOG_KEY` is set
2. **Check network**: PostHog proxies through `/ingest` - check Network tab
3. **Flush manually**: Call `posthog.shutdown()` to flush pending events
4. **Check filters**: Verify event filters in PostHog dashboard

### Session recordings not working

1. **Enable in PostHog**: Go to Project Settings → Recordings
2. **Check capture_exceptions**: Set to `true` in initialization
3. **Browser compatibility**: Recordings require modern browsers

### Feature flags not working

1. **Identify users first**: Call `identifyUser()` before checking flags
2. **Wait for flags to load**: Use `posthog.onFeatureFlags()` callback
3. **Check rollout**: Verify flag is enabled in PostHog dashboard

## Resources

-   [PostHog Documentation](https://posthog.com/docs)
-   [PostHog API Reference](https://posthog.com/docs/api)
-   [Session Recording Guide](https://posthog.com/docs/session-replay)
-   [Feature Flags Guide](https://posthog.com/docs/feature-flags)
-   [A/B Testing Guide](https://posthog.com/docs/experiments)

## Support

-   **PostHog Community**: [Slack](https://posthog.com/slack)
-   **GitHub Issues**: [posthog/posthog](https://github.com/PostHog/posthog)
-   **Email**: hey@posthog.com
