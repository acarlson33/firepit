/**
 * PostHog Utilities
 * 
 * Comprehensive utilities for analytics, error tracking, and custom instrumentation
 * with PostHog.
 */

import { PostHog } from 'posthog-node';

type PostHogClient = PostHog | null;

let posthog: PostHogClient = null;

/**
 * Initialize PostHog (server-side only)
 */
export function initPostHog(): PostHogClient {
  if (typeof window !== 'undefined') {
    // PostHog Node client doesn't run in the browser
    return null;
  }

  if (posthog) {
    return posthog;
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('[PostHog] API key not found - analytics disabled');
    return null;
  }

  try {
    posthog = new PostHog(apiKey, {
      host,
      flushAt: 20,
      flushInterval: 10000,
    });
    
    console.log('[PostHog] Initialized successfully');
    return posthog;
  } catch (error) {
    console.error('[PostHog] Failed to initialize:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get the PostHog client instance
 */
export function getPostHog(): PostHogClient {
  if (!posthog) {
    posthog = initPostHog();
  }
  return posthog;
}

/**
 * Shutdown PostHog gracefully (call on app shutdown)
 */
export async function shutdownPostHog() {
  if (posthog) {
    await posthog.shutdown();
  }
}

/**
 * Log levels for structured logging
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

/**
 * Log a message with PostHog
 * In production, this forwards to PostHog. In development, it also logs to console.
 */
export function log(level: LogLevelType, message: string, attributes?: Record<string, unknown>) {
  // Console logging (development and as fallback)
  if (process.env.NODE_ENV !== 'production') {
    const consoleMethod = level === LogLevel.ERROR ? 'error' : 
                         level === LogLevel.WARN ? 'warn' : 'log';
    console[consoleMethod](`[${String(level).toUpperCase()}]`, message, attributes || '');
  }

  // PostHog custom event
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: 'system', // Use a system identifier for logs without a user
      event: 'application_log',
      properties: {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...attributes,
      },
    });
  }
}

/**
 * Convenience logging functions
 */
export const logger = {
  debug: (message: string, attributes?: Record<string, unknown>) => 
    log(LogLevel.DEBUG, message, attributes),
  
  info: (message: string, attributes?: Record<string, unknown>) => 
    log(LogLevel.INFO, message, attributes),
  
  warn: (message: string, attributes?: Record<string, unknown>) => 
    log(LogLevel.WARN, message, attributes),
  
  error: (message: string, attributes?: Record<string, unknown>) => 
    log(LogLevel.ERROR, message, attributes),
};

/**
 * Record an error with PostHog
 */
export function recordError(error: Error | string, customAttributes?: Record<string, unknown>) {
  // Console error as fallback
  console.error('[ERROR]', error, customAttributes || '');

  const ph = getPostHog();
  if (ph) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;
    
    ph.capture({
      distinctId: customAttributes?.userId as string || 'system',
      event: '$exception',
      properties: {
        $exception_type: typeof error === 'string' ? 'Error' : error.name,
        $exception_message: errorMessage,
        $exception_stack_trace: errorStack,
        ...customAttributes,
      },
    });
  }
}

/**
 * Record a custom event in PostHog
 */
export function recordEvent(eventType: string, attributes: Record<string, unknown>) {
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: attributes.userId as string || 'system',
      event: eventType,
      properties: attributes,
    });
  }
}

/**
 * Record a custom metric in PostHog
 */
export function recordMetric(name: string, value: number) {
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: 'system',
      event: 'custom_metric',
      properties: {
        metric_name: name,
        metric_value: value,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Increment a counter metric in PostHog
 */
export function incrementMetric(name: string, value = 1) {
  recordMetric(name, value);
}

/**
 * Track an API call with timing and status
 */
export function trackApiCall(
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number,
  attributes?: Record<string, unknown>
) {
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: attributes?.userId as string || 'system',
      event: 'api_call',
      properties: {
        endpoint,
        method,
        status_code: statusCode,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        ...attributes,
      },
    });
  }
}

/**
 * Set transaction name (compatibility layer - stores as property)
 */
let currentTransactionName: string | null = null;

export function setTransactionName(name: string) {
  currentTransactionName = name;
}

/**
 * Add custom attributes to track with the next event
 */
let transactionAttributes: Record<string, string | number | boolean> = {};

export function addTransactionAttributes(attributes: Record<string, string | number | boolean>) {
  transactionAttributes = { ...transactionAttributes, ...attributes };
}

/**
 * Get current transaction attributes and reset
 */
export function getAndResetTransactionAttributes(): Record<string, string | number | boolean> & { transactionName?: string } {
  const attrs = { ...transactionAttributes };
  if (currentTransactionName) {
    attrs.transactionName = currentTransactionName;
  }
  transactionAttributes = {};
  currentTransactionName = null;
  return attrs;
}

/**
 * Identify a user in PostHog
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  const ph = getPostHog();
  if (ph) {
    ph.identify({
      distinctId: userId,
      properties,
    });
  }
}

/**
 * Set user properties in PostHog
 */
export function setUserProperties(userId: string, properties: Record<string, unknown>) {
  const ph = getPostHog();
  if (ph) {
    ph.identify({
      distinctId: userId,
      properties,
    });
  }
}

/**
 * Track a page view (use in app router)
 */
export function trackPageView(userId: string, path: string, properties?: Record<string, unknown>) {
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: userId,
      event: '$pageview',
      properties: {
        $current_url: path,
        ...properties,
      },
    });
  }
}

/**
 * Capture a feature flag evaluation
 */
export function trackFeatureFlag(
  userId: string,
  flagKey: string,
  value: boolean | string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHog();
  if (ph) {
    ph.capture({
      distinctId: userId,
      event: '$feature_flag_called',
      properties: {
        $feature_flag: flagKey,
        $feature_flag_response: value,
        ...properties,
      },
    });
  }
}

/**
 * Group a user (for B2B analytics)
 */
export function groupUser(
  userId: string,
  groupType: string,
  groupKey: string,
  groupProperties?: Record<string, unknown>
) {
  const ph = getPostHog();
  if (ph) {
    ph.groupIdentify({
      groupType,
      groupKey,
      properties: groupProperties,
    });
    
    // Associate user with group
    ph.capture({
      distinctId: userId,
      event: '$group_identify',
      properties: {
        $group_type: groupType,
        $group_key: groupKey,
      },
    });
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceTimer {
  private startTime: number;
  private eventName: string;
  private userId: string;

  constructor(eventName: string, userId = 'system') {
    this.startTime = Date.now();
    this.eventName = eventName;
    this.userId = userId;
  }

  end(additionalProperties?: Record<string, unknown>) {
    const duration = Date.now() - this.startTime;
    const ph = getPostHog();
    if (ph) {
      ph.capture({
        distinctId: this.userId,
        event: this.eventName,
        properties: {
          duration_ms: duration,
          ...additionalProperties,
        },
      });
    }
    return duration;
  }
}

/**
 * Start a performance timer
 */
export function startTimer(eventName: string, userId?: string): PerformanceTimer {
  return new PerformanceTimer(eventName, userId);
}
