# New Relic APM Integration

This application includes New Relic APM (Application Performance Monitoring) integration for server-side monitoring and log ingestion.

## Features

- **Server-side only monitoring** - No client-side exposure of credentials
- **Automatic initialization** - Enabled via Next.js instrumentation hook
- **Zero configuration** - Works out of the box with environment variables
- **Graceful degradation** - Application continues to work without New Relic credentials

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

You should see a log message in the console:

```
[New Relic] Initialized for app: firepit-production
```

If you don't see this message, check that:
- Both environment variables are set
- The values are correct
- You've restarted your application after adding the variables

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
- **Railway**: Environment Variables in Settings
- **Render**: Environment Variables in Dashboard
- **Docker**: Use `-e` flag or `.env` file
- **Kubernetes**: ConfigMaps or Secrets

## Configuration

The integration uses environment variables for configuration. Additional New Relic settings can be configured by setting standard New Relic environment variables:

- `NEW_RELIC_LOG_LEVEL` - Set log level (e.g., `info`, `debug`)
- `NEW_RELIC_DISTRIBUTED_TRACING_ENABLED` - Enable distributed tracing (default: `true`)
- `NEW_RELIC_NO_CONFIG_FILE` - Disable config file lookup (default: `true`)

See [New Relic Node.js Agent Configuration](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/) for all available options.

## Monitoring Features

Once enabled, New Relic will automatically monitor:

- ✅ Request/response times
- ✅ Database queries (via Appwrite)
- ✅ External HTTP calls
- ✅ Memory usage
- ✅ CPU usage
- ✅ Error rates and stack traces
- ✅ Custom transactions
- ✅ Log ingestion

## Troubleshooting

### No data in New Relic

1. Verify environment variables are set correctly
2. Check application logs for initialization message
3. Ensure your license key is valid
4. Wait a few minutes - data can take time to appear

### Application fails to start

- The integration is designed to never block application startup
- Check console for warning messages
- Verify the New Relic package is installed: `bun pm ls newrelic`

### Edge runtime compatibility

The instrumentation only runs on the Node.js runtime. Edge runtime routes will not be monitored by New Relic.

## Testing

Tests for the New Relic integration are located in:
- `src/__tests__/instrumentation.test.ts`

Run tests:

```bash
bun test src/__tests__/instrumentation.test.ts
```

## Security

- ✅ License keys are never exposed to the browser
- ✅ All monitoring is server-side only
- ✅ No `NEXT_PUBLIC_` prefix used
- ✅ Environment variables remain secure
- ✅ Credentials are only accessible to server-side code

## Additional Resources

- [New Relic APM Documentation](https://docs.newrelic.com/docs/apm/)
- [Node.js Agent Guide](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/)
- [Next.js Instrumentation Hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
