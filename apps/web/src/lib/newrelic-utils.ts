/**
 * New Relic Utilities
 *
 * Comprehensive utilities for logging, error tracking, and custom instrumentation
 * with New Relic APM.
 */

import { NextResponse } from "next/server";
import { SeverityNumber, logs } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    BatchLogRecordProcessor,
    LoggerProvider,
    SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

import { PostHog } from "posthog-node";

// Inlined from posthog-logs.ts — OTLP log pipeline to PostHog.
const posthogLogsToken =
    process.env.POSTHOG_PROJECT_API_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
    "";

const posthogLogsHost =
    process.env.POSTHOG_LOGS_HOST ??
    process.env.POSTHOG_HOST ??
    "https://us.i.posthog.com";
const posthogLogsUrl = `${posthogLogsHost.replace(/\/$/, "")}/i/v1/logs`;

const otlpLogExporter = new OTLPLogExporter({
    url: posthogLogsUrl,
    headers: {
        Authorization: `Bearer ${posthogLogsToken}`,
        "Content-Type": "application/json",
    },
});

export const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
        "service.name": "firepit-web",
    }),
    processors: posthogLogsToken
        ? [
              process.env.NODE_ENV === "production"
                  ? new BatchLogRecordProcessor({
                        exporter: otlpLogExporter,
                        scheduledDelayMillis: 1_000,
                    })
                  : new SimpleLogRecordProcessor({ exporter: otlpLogExporter }),
          ]
        : [],
});

const serverLogger = loggerProvider.getLogger("firepit-web");

type LogAttributeValue = string | number | boolean | null | undefined;

function normalizeLogAttributes(
    attributes?: Record<string, unknown>,
): Record<string, LogAttributeValue> | undefined {
    if (!attributes) {
        return undefined;
    }

    const normalizedAttributes: Record<string, LogAttributeValue> = {};

    for (const [key, value] of Object.entries(attributes)) {
        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null ||
            value === undefined
        ) {
            normalizedAttributes[key] = value;
            continue;
        }

        if (typeof value === "bigint") {
            normalizedAttributes[key] = value.toString();
            continue;
        }

        try {
            normalizedAttributes[key] = JSON.stringify(value);
        } catch {
            normalizedAttributes[key] = String(value);
        }
    }

    return normalizedAttributes;
}

let loggerProviderRegistered = false;

export function registerPostHogLoggerProvider() {
    if (loggerProviderRegistered || process.env.NODE_ENV === "test") {
        return;
    }

    loggerProviderRegistered = true;
    logs.setGlobalLoggerProvider(loggerProvider);
}

function emitPostHogLog(params: {
    body: string;
    severityNumber: SeverityNumber;
    attributes?: Record<string, unknown>;
}) {
    if (!posthogLogsToken) {
        return;
    }

    registerPostHogLoggerProvider();

    serverLogger.emit({
        body: params.body,
        severityNumber: params.severityNumber,
        attributes: normalizeLogAttributes(params.attributes),
    });
}

export function flushPostHogLogs() {
    return loggerProvider.forceFlush();
}

function schedulePostHogLogFlush() {
    try {
        after(async () => {
            await flushPostHogLogs();
        });
    } catch {
        void flushPostHogLogs().catch(() => {});
    }
}

// Inlined from posthog-server.ts — PostHog Node client singleton.

type PostHogShim = {
    capture: (...args: Parameters<PostHog["capture"]>) => void;
    captureException: (
        ...args: Parameters<PostHog["captureException"]>
    ) => void;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
};

function createNoOpShim(): PostHogShim {
    return {
        capture() {},
        captureException() {},
        async flush() {},
        async shutdown() {},
    };
}

let posthogClient: PostHog | PostHogShim | null = null;

function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value;
    }
    return new Error(typeof value === "string" ? value : String(value));
}

function toErrorMetadata(value: unknown) {
    if (value instanceof Error) {
        return {
            errorMessage: value.message,
            errorName: value.name,
            errorStack: value.stack,
        };
    }
    return {
        errorMessage: typeof value === "string" ? value : String(value),
    };
}

export function getPostHogClient() {
    const projectApiKey =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
        "";
    const host =
        process.env.POSTHOG_HOST ??
        process.env.NEXT_PUBLIC_POSTHOG_HOST ??
        "https://us.i.posthog.com";

    if (!posthogClient) {
        if (!projectApiKey) {
            posthogClient = createNoOpShim();
        } else {
            posthogClient = new PostHog(projectApiKey, {
                host,
                flushAt: 1,
                flushInterval: 0,
            });
        }
    }
    return posthogClient;
}

function capturePostHogServerError(
    error: unknown,
    properties?: Record<string, unknown>,
) {
    const errorObject = toError(error);

    try {
        getPostHogClient().captureException(errorObject, "server", {
            errorMessage: errorObject.message,
            errorName: errorObject.name,
            errorStack: errorObject.stack,
            ...properties,
        });
    } catch {
        // Telemetry forwarding should never impact request handling.
    }
}

let posthogProcessHandlersRegistered = false;
const capturedUnhandledRejectionErrors = new WeakSet<Error>();

// ponytail: test-only reset for the PostHog singleton. No-op in production.
export function __resetPostHogClient() {
    posthogClient = null;
}

export function registerPostHogProcessHandlers() {
    if (posthogProcessHandlersRegistered || process.env.NODE_ENV === "test") {
        return;
    }

    posthogProcessHandlersRegistered = true;

    process.on("uncaughtExceptionMonitor", (error, origin) => {
        if (error instanceof Error && capturedUnhandledRejectionErrors.has(error)) {
            return;
        }

        const errorObj = toError(error);
        try {
            getPostHogClient().captureException(errorObj, "server", {
                origin: `uncaught_exception:${origin}`,
                ...toErrorMetadata(error),
            });
        } catch {
            // Telemetry forwarding should never impact process-level handlers.
        }
    });

    process.on("unhandledRejection", (reason) => {
        const error = toError(reason);
        capturedUnhandledRejectionErrors.add(error);
        try {
            getPostHogClient().captureException(error, "server", {
                origin: "unhandled_rejection",
            });
        } catch {
            // Telemetry forwarding should never impact process-level handlers.
        }
        setImmediate(() => {
            throw error;
        });
    });

    process.once("beforeExit", () => {
        const client = posthogClient;
        if (client) {
            void client.flush().catch(() => {});
        }
    });

    process.once("SIGINT", () => {
        const client = posthogClient;
        void (async () => {
            if (client) {
                await client.flush().catch(() => {});
            }
            process.exit(130);
        })();
    });

    process.once("SIGTERM", () => {
        const client = posthogClient;
        void (async () => {
            if (client) {
                await client.flush().catch(() => {});
            }
            process.exit(143);
        })();
    });
}

type NewRelicAgent = {
    recordCustomEvent: (
        _eventType: string,
        _attributes: Record<string, unknown>,
    ) => void;
    recordMetric: (_name: string, _value: number) => void;
    incrementMetric: (_name: string, _value?: number) => void;
    noticeError: (
        _error: Error | string,
        _customAttributes?: Record<string, unknown>,
    ) => void;
    addCustomAttribute: (
        _key: string,
        _value: string | number | boolean,
    ) => void;
    addCustomAttributes: (
        _attributes: Record<string, string | number | boolean>,
    ) => void;
    setTransactionName: (_name: string) => void;
    getTransaction: () => Transaction | null;
    startBackgroundTransaction: (
        _name: string,
        _group: string | null,
        _handle: () => void,
    ) => void;
    startWebTransaction: (_url: string, _handle: () => void) => void;
    endTransaction: () => void;
    getBrowserTimingHeader: () => string;
    setLlmTokenCountCallback: (
        _callback: (_model: string, _content: string) => number,
    ) => void;
};

type Transaction = {
    end: () => void;
    ignore: () => void;
    acceptDistributedTraceHeaders: (
        _transportType: string,
        _headers: Record<string, string>,
    ) => void;
    insertDistributedTraceHeaders: (_headers: Record<string, string>) => void;
};

type TelemetryProvider = "newrelic" | "posthog" | "both" | "none";

let newrelic: NewRelicAgent | null = null;

function getTelemetryProvider(): TelemetryProvider {
    const rawProvider = process.env.TELEMETRY_PROVIDER?.toLowerCase();
    if (
        rawProvider === "newrelic" ||
        rawProvider === "posthog" ||
        rawProvider === "both" ||
        rawProvider === "none"
    ) {
        return rawProvider;
    }

    return "newrelic";
}

function shouldSendToNewRelic() {
    const provider = getTelemetryProvider();
    return provider === "newrelic" || provider === "both";
}

function hasPostHogCredentials() {
    const projectToken =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

    return Boolean(projectToken);
}

function shouldSendToPostHog() {
    if (process.env.NODE_ENV === "test") {
        return process.env.ENABLE_POSTHOG_IN_TESTS === "true";
    }

    if (typeof window !== "undefined") {
        return false;
    }

    const provider = getTelemetryProvider();
    if (provider !== "posthog" && provider !== "both") {
        return false;
    }

    return hasPostHogCredentials();
}

function getDistinctId(attributes?: Record<string, unknown>) {
    const candidate =
        attributes?.distinctId ??
        attributes?.userId ??
        attributes?.actorUserId ??
        attributes?.senderId ??
        attributes?.authorUserId ??
        attributes?.actorId;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
    }

    return "server";
}

function getPersonProperties(attributes?: Record<string, unknown>) {
    if (!attributes) {
        return undefined;
    }

    if (getDistinctId(attributes) === "server") {
        return undefined;
    }

    const usernameCandidate =
        attributes.username ??
        attributes.userName ??
        attributes.actorUserName ??
        attributes.name;
    const emailCandidate = attributes.email;

    const properties: Record<string, unknown> = {};
    if (
        typeof usernameCandidate === "string" &&
        usernameCandidate.trim().length > 0
    ) {
        properties.username = usernameCandidate;
    }

    if (
        typeof emailCandidate === "string" &&
        emailCandidate.trim().length > 0
    ) {
        properties.email = emailCandidate;
    }

    return Object.keys(properties).length > 0 ? properties : undefined;
}

function capturePostHogEvent(
    event: string,
    attributes?: Record<string, unknown>,
) {
    if (!shouldSendToPostHog()) {
        return;
    }

    try {
        const posthog = getPostHogClient();
        const personProperties = getPersonProperties(attributes);
        posthog.capture({
            distinctId: getDistinctId(attributes),
            event,
            properties: personProperties
                ? {
                      ...attributes,
                      $set: {
                          ...personProperties,
                      },
                  }
                : attributes,
        });
    } catch {
        // Telemetry forwarding should never impact request handling.
    }
}

function getNewRelicForDispatch() {
    if (!newrelic && shouldSendToNewRelic()) {
        void getNewRelic();
    }

    return getNewRelicSync();
}

/**
 * Initialize New Relic (should be called automatically by instrumentation.ts)
 * @returns {Promise<NewRelicAgent | null>} The return value.
 */
async function initNewRelic() {
    if (typeof window !== "undefined") {
        // New Relic doesn't run in the browser (only server-side)
        return null;
    }

    if (newrelic) {
        return newrelic;
    }

    try {
        // Dynamic import for New Relic (server-side only)
        const nr = await import("newrelic");
        newrelic = nr.default as NewRelicAgent;
        return newrelic;
    } catch {
        // New Relic not available (development mode or not configured)
        return null;
    }
}

/**
 * Get the New Relic agent instance
 * @returns {Promise<NewRelicAgent | null>} The return value.
 */
async function getNewRelic(): Promise<NewRelicAgent | null> {
    if (!newrelic) {
        newrelic = await initNewRelic();
    }
    return newrelic;
}

/**
 * Get the New Relic agent instance synchronously (may return null if not initialized)
 * @returns {NewRelicAgent | null} The return value.
 */
function getNewRelicSync(): NewRelicAgent | null {
    return newrelic;
}

/**
 * Log levels for structured logging
 */
const LogLevel = {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
} as const;

type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Structured log entry (for internal use)
 */
type _LogEntry = {
    level: LogLevelType;
    message: string;
    timestamp: string;
    attributes?: Record<string, unknown>;
};

/**
 * Log a message with New Relic
 * In production, this forwards to New Relic. In development, it also logs to console.
 *
 * @param {'debug' | 'info' | 'warn' | 'error'} level - The level value.
 * @param {string} message - The message value.
 * @param {Record<string, unknown> | undefined} attributes - The attributes value, if provided.
 * @returns {void} The return value.
 */
function log(
    level: LogLevelType,
    message: string,
    attributes?: Record<string, unknown>,
) {
    // Console logging (development and as fallback)
    if (process.env.NODE_ENV !== "production") {
        const consoleMethod =
            level === LogLevel.ERROR
                ? "error"
                : level === LogLevel.WARN
                  ? "warn"
                  : "log";
        console[consoleMethod](
            `[${String(level).toUpperCase()}]`,
            message,
            attributes || "",
        );
    }

    emitPostHogLog({
        body: message,
        severityNumber:
            level === LogLevel.ERROR
                ? SeverityNumber.ERROR
                : level === LogLevel.WARN
                  ? SeverityNumber.WARN
                  : level === LogLevel.DEBUG
                    ? SeverityNumber.DEBUG
                    : SeverityNumber.INFO,
        attributes: {
            level,
            message,
            timestamp: new Date().toISOString(),
            ...attributes,
        },
    });
    schedulePostHogLogFlush();

    // New Relic custom event
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.recordCustomEvent("ApplicationLog", {
            level,
            message,
            timestamp: new Date().toISOString(),
            ...attributes,
        });
    }

    capturePostHogEvent("application_log", {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...attributes,
    });
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
 *
 * @param {string | Error} error - The error value.
 * @param {Record<string, unknown> | undefined} customAttributes - The custom attributes value, if provided.
 * @returns {void} The return value.
 */
export function recordError(
    error: Error | string,
    customAttributes?: Record<string, unknown>,
) {
    // Console error as fallback
    console.error("[ERROR]", error, customAttributes || "");

    const errorObject =
        error instanceof Error ? error : new Error(String(error));

    emitPostHogLog({
        body: errorObject.message,
        severityNumber: SeverityNumber.ERROR,
        attributes: {
            errorMessage: errorObject.message,
            errorName: errorObject.name,
            errorStack: errorObject.stack,
            ...customAttributes,
        },
    });
    schedulePostHogLogFlush();

    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.noticeError(errorObject, customAttributes);
    }

    if (shouldSendToPostHog()) {
        capturePostHogServerError(errorObject, customAttributes);
    }

    capturePostHogEvent("error_recorded", {
        errorMessage: errorObject.message,
        errorName: errorObject.name,
        errorStack: errorObject.stack,
        ...customAttributes,
    });
}

/**
 * Record a custom event in New Relic
 *
 * @param {string} eventType - The event type value.
 * @param {{ [x: string]: unknown; }} attributes - The attributes value.
 * @returns {void} The return value.
 */
export function recordEvent(
    eventType: string,
    attributes: Record<string, unknown>,
) {
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.recordCustomEvent(eventType, attributes);
    }

    capturePostHogEvent(eventType, attributes);
}

/**
 * Record a custom metric in New Relic
 *
 * @param {string} name - The name value.
 * @param {number} value - The value value.
 * @returns {void} The return value.
 */
export function recordMetric(name: string, value: number) {
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.recordMetric(name, value);
    }

    capturePostHogEvent("metric_recorded", {
        metricName: name,
        value,
    });
}

/**
 * Increment a counter metric in New Relic
 *
 * @param {string} name - The name value.
 * @param {number} value - The value value, if provided.
 * @returns {void} The return value.
 */
function incrementMetric(name: string, value = 1) {
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.incrementMetric(name, value);
    }

    capturePostHogEvent("metric_incremented", {
        metricName: name,
        incrementBy: value,
    });
}

/**
 * Add custom attributes to the current transaction
 *
 * @param {{ [x: string]: string | number | boolean; }} attributes - The attributes value.
 * @returns {void} The return value.
 */
export function addTransactionAttributes(
    attributes: Record<string, string | number | boolean>,
) {
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.addCustomAttributes(attributes);
    }
}

/**
 * Set the transaction name for better organization in New Relic
 *
 * @param {string} name - The name value.
 * @returns {void} The return value.
 */
export function setTransactionName(name: string) {
    const nr = getNewRelicForDispatch();
    if (shouldSendToNewRelic() && nr) {
        nr.setTransactionName(name);
    }
}

/**
 * Track API endpoint performance
 *
 * @param {string} endpoint - The endpoint value.
 * @param {string} method - The method value.
 * @param {number} statusCode - The status code value.
 * @param {number} duration - The duration value.
 * @param {Record<string, unknown> | undefined} attributes - The attributes value, if provided.
 * @returns {void} The return value.
 */
export function trackApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    attributes?: Record<string, unknown>,
) {
    recordEvent("ApiCall", {
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
 * Track message events
 *
 * @param {'sent' | 'edited' | 'deleted'} type - The type value.
 * @param {'channel' | 'dm'} channelType - The channel type value.
 * @param {Record<string, unknown> | undefined} attributes - The attributes value, if provided.
 * @returns {void} The return value.
 */
export function trackMessage(
    type: "sent" | "edited" | "deleted",
    channelType: "channel" | "dm",
    attributes?: Record<string, unknown>,
) {
    recordEvent("Message", {
        type,
        channelType,
        ...attributes,
    });

    incrementMetric(`Custom/Message/${type}/${channelType}`);
}

/**
 * Return a 401 Unauthorized response with logging
 * Use this instead of direct NextResponse.json() for auth failures
 *
 * @param {Record<string, unknown> | undefined} attributes - Additional attributes to log
 * @returns {NextResponse} The return value.
 */
export function returnUnauthorized(attributes?: Record<string, unknown>) {
    logger.warn("Unauthorized request", attributes);
    return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
    );
}

/**
 * Return a 403 Forbidden response with logging
 * Use this instead of direct NextResponse.json() for permission failures
 *
 * @param {Record<string, unknown> | undefined} attributes - Additional attributes to log
 * @returns {NextResponse} The return value.
 */
export function returnForbidden(attributes?: Record<string, unknown>) {
    logger.warn("Forbidden request", attributes);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}


