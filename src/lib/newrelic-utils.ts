/**
 * New Relic Utilities
 * 
 * Comprehensive utilities for logging, error tracking, and custom instrumentation
 * with New Relic APM.
 */

type NewRelicAgent = {
  recordCustomEvent: (eventType: string, attributes: Record<string, unknown>) => void;
  recordMetric: (name: string, value: number) => void;
  incrementMetric: (name: string, value?: number) => void;
  noticeError: (error: Error | string, customAttributes?: Record<string, unknown>) => void;
  addCustomAttribute: (key: string, value: string | number | boolean) => void;
  addCustomAttributes: (attributes: Record<string, string | number | boolean>) => void;
  setTransactionName: (name: string) => void;
  getTransaction: () => Transaction | null;
  startBackgroundTransaction: (name: string, group: string | null, handle: () => void) => void;
  startWebTransaction: (url: string, handle: () => void) => void;
  endTransaction: () => void;
  getBrowserTimingHeader: () => string;
  setLlmTokenCountCallback: (callback: (model: string, content: string) => number) => void;
};

type Transaction = {
  end: () => void;
  ignore: () => void;
  acceptDistributedTraceHeaders: (transportType: string, headers: Record<string, string>) => void;
  insertDistributedTraceHeaders: (headers: Record<string, string>) => void;
};

let newrelic: NewRelicAgent | null = null;

/**
 * Initialize New Relic (should be called automatically by instrumentation.ts)
 */
export async function initNewRelic() {
  if (typeof window !== 'undefined') {
    // New Relic doesn't run in the browser (only server-side)
    return null;
  }

  if (newrelic) {
    return newrelic;
  }

  try {
    // Dynamic import for New Relic (server-side only)
    const nr = await import('newrelic');
    newrelic = nr.default as NewRelicAgent;
    return newrelic;
  } catch {
    // New Relic not available (development mode or not configured)
    return null;
  }
}

/**
 * Get the New Relic agent instance
 */
export async function getNewRelic(): Promise<NewRelicAgent | null> {
  if (!newrelic) {
    newrelic = await initNewRelic();
  }
  return newrelic;
}

/**
 * Get the New Relic agent instance synchronously (may return null if not initialized)
 */
export function getNewRelicSync(): NewRelicAgent | null {
  return newrelic;
}

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
};

/**
 * Log a message with New Relic
 * In production, this forwards to New Relic. In development, it also logs to console.
 */
export function log(level: LogLevel, message: string, attributes?: Record<string, unknown>) {
  // Console logging (development and as fallback)
  if (process.env.NODE_ENV !== 'production') {
    const consoleMethod = level === LogLevel.ERROR ? 'error' : 
                         level === LogLevel.WARN ? 'warn' : 'log';
    console[consoleMethod](`[${level.toUpperCase()}]`, message, attributes || '');
  }

  // New Relic custom event
  const nr = getNewRelicSync();
  if (nr) {
    nr.recordCustomEvent('ApplicationLog', {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...attributes,
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
 * Record an error with New Relic
 */
export function recordError(error: Error | string, customAttributes?: Record<string, unknown>) {
  // Console error as fallback
  console.error('[ERROR]', error, customAttributes || '');

  const nr = getNewRelicSync();
  if (nr) {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    nr.noticeError(errorObj, customAttributes);
  }
}

/**
 * Record a custom event in New Relic
 */
export function recordEvent(eventType: string, attributes: Record<string, unknown>) {
  const nr = getNewRelicSync();
  if (nr) {
    nr.recordCustomEvent(eventType, attributes);
  }
}

/**
 * Record a custom metric in New Relic
 */
export function recordMetric(name: string, value: number) {
  const nr = getNewRelicSync();
  if (nr) {
    nr.recordMetric(name, value);
  }
}

/**
 * Increment a counter metric in New Relic
 */
export function incrementMetric(name: string, value = 1) {
  const nr = getNewRelicSync();
  if (nr) {
    nr.incrementMetric(name, value);
  }
}

/**
 * Add custom attributes to the current transaction
 */
export function addTransactionAttributes(attributes: Record<string, string | number | boolean>) {
  const nr = getNewRelicSync();
  if (nr) {
    nr.addCustomAttributes(attributes);
  }
}

/**
 * Set the transaction name for better organization in New Relic
 */
export function setTransactionName(name: string) {
  const nr = getNewRelicSync();
  if (nr) {
    nr.setTransactionName(name);
  }
}

/**
 * Track API endpoint performance
 */
export function trackApiCall(
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number,
  attributes?: Record<string, unknown>
) {
  recordEvent('ApiCall', {
    endpoint,
    method,
    statusCode,
    duration,
    success: statusCode >= 200 && statusCode < 300,
    ...attributes,
  });

  recordMetric(`Custom/API/${endpoint}/${method}`, duration);
}

/**
 * Track database query performance
 */
export function trackDatabaseQuery(
  operation: string,
  collection: string,
  duration: number,
  recordCount?: number,
  attributes?: Record<string, unknown>
) {
  recordEvent('DatabaseQuery', {
    operation,
    collection,
    duration,
    recordCount,
    ...attributes,
  });

  recordMetric(`Custom/Database/${collection}/${operation}`, duration);
}

/**
 * Track authentication events
 */
export function trackAuth(
  action: 'login' | 'logout' | 'signup' | 'failed',
  userId?: string,
  attributes?: Record<string, unknown>
) {
  recordEvent('Authentication', {
    action,
    userId,
    ...attributes,
  });

  incrementMetric(`Custom/Auth/${action}`);
}

/**
 * Track user actions
 */
export function trackUserAction(
  action: string,
  userId: string,
  attributes?: Record<string, unknown>
) {
  recordEvent('UserAction', {
    action,
    userId,
    ...attributes,
  });

  incrementMetric(`Custom/UserAction/${action}`);
}

/**
 * Track message events
 */
export function trackMessage(
  type: 'sent' | 'edited' | 'deleted',
  channelType: 'channel' | 'dm',
  attributes?: Record<string, unknown>
) {
  recordEvent('Message', {
    type,
    channelType,
    ...attributes,
  });

  incrementMetric(`Custom/Message/${type}/${channelType}`);
}

/**
 * Track performance timing
 */
export function trackTiming(name: string, duration: number, attributes?: Record<string, unknown>) {
  recordEvent('Timing', {
    name,
    duration,
    ...attributes,
  });

  recordMetric(`Custom/Timing/${name}`, duration);
}

/**
 * Measure and track execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    trackTiming(name, duration, { success: true, ...attributes });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    trackTiming(name, duration, { success: false, ...attributes });
    recordError(error instanceof Error ? error : String(error), { operation: name, ...attributes });
    throw error;
  }
}

/**
 * Measure and track execution time of a sync function
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  attributes?: Record<string, unknown>
): T {
  const start = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - start;
    trackTiming(name, duration, { success: true, ...attributes });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    trackTiming(name, duration, { success: false, ...attributes });
    recordError(error instanceof Error ? error : String(error), { operation: name, ...attributes });
    throw error;
  }
}

/**
 * Create a background transaction for async work
 */
export async function backgroundTransaction<T>(
  name: string,
  group: string,
  fn: () => Promise<T>
): Promise<T> {
  const nr = getNewRelicSync();
  if (!nr) {
    return fn();
  }

  return new Promise((resolve, reject) => {
    nr.startBackgroundTransaction(name, group, () => {
      void (async () => {
        try {
          const result = await fn();
          nr.endTransaction();
          resolve(result);
        } catch (error) {
          nr.endTransaction();
          reject(error);
        }
      })();
    });
  });
}

/**
 * Get browser timing header for Real User Monitoring (RUM)
 * Insert this in your HTML <head> for browser monitoring
 */
export function getBrowserTimingHeader(): string {
  const nr = getNewRelicSync();
  if (nr) {
    return nr.getBrowserTimingHeader();
  }
  return '';
}
