import { SeverityNumber, logs } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    BatchLogRecordProcessor,
    LoggerProvider,
} from "@opentelemetry/sdk-logs";

const posthogLogsToken =
    process.env.POSTHOG_PROJECT_API_KEY ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
    "";
const posthogLogsHost =
    process.env.POSTHOG_HOST ??
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    "https://us.i.posthog.com";
const posthogLogsUrl = `${posthogLogsHost.replace(/\/$/, "")}/i/v1/logs`;

export const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
        "service.name": "firepit-web",
    }),
    processors: posthogLogsToken
        ? [
              new BatchLogRecordProcessor(
                  new OTLPLogExporter({
                      url: posthogLogsUrl,
                      headers: {
                          Authorization: `Bearer ${posthogLogsToken}`,
                          "Content-Type": "application/json",
                      },
                  }),
              ),
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

export function emitPostHogLog(params: {
    body: string;
    severityNumber: SeverityNumber;
    attributes?: Record<string, unknown>;
}) {
    serverLogger.emit({
        body: params.body,
        severityNumber: params.severityNumber,
        attributes: normalizeLogAttributes(params.attributes),
    });
}

export function flushPostHogLogs() {
    return loggerProvider.forceFlush();
}

export function schedulePostHogLogFlush() {
    try {
        after(async () => {
            await flushPostHogLogs();
        });
    } catch {
        // Not running inside a Next.js request context.
    }
}
