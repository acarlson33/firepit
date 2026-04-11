/**
 * Client-side logger that delegates to client-telemetry for routing
 * events to New Relic or PostHog based on NEXT_PUBLIC_TELEMETRY_PROVIDER.
 * Falls back to console in development.
 */

import { recordClientAction, recordClientError } from "@/lib/client-telemetry";

interface LogAttributes {
    [key: string]: string | number | boolean | null | undefined;
}

class ClientLogger {
    private shouldLog(): boolean {
        return process.env.NODE_ENV !== "production";
    }

    info(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_info", { message, ...attributes });

        if (this.shouldLog()) {
            console.log(`[INFO] ${message}`, attributes ?? "");
        }
    }

    warn(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_warn", { message, ...attributes });

        if (this.shouldLog()) {
            console.warn(`[WARN] ${message}`, attributes ?? "");
        }
    }

    error(
        message: string,
        error?: Error | string,
        attributes?: LogAttributes,
    ): void {
        if (error instanceof Error) {
            recordClientError(error, { message, ...attributes });
        } else {
            recordClientAction("log_error", {
                message,
                error: error?.toString(),
                ...attributes,
            });
        }

        if (this.shouldLog()) {
            console.error(`[ERROR] ${message}`, error ?? "", attributes ?? "");
        }
    }

    debug(message: string, attributes?: LogAttributes): void {
        // Only log debug messages in development
        if (this.shouldLog()) {
            console.log(`[DEBUG] ${message}`, attributes ?? "");
        }
    }
}

// Export singleton instance
export const logger = new ClientLogger();
