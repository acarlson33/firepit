"use client";

import posthog from "posthog-js";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type TestStatus = {
    detail: string;
    name: string;
    status: "idle" | "ok" | "error";
};

export function ErrorIngestionTester() {
    const [status, setStatus] = useState<TestStatus>({
        detail: "No error test triggered yet.",
        name: "none",
        status: "idle",
    });

    function markOk(name: string, detail: string) {
        setStatus({ detail, name, status: "ok" });
    }

    function markError(name: string, error: unknown) {
        const detail =
            error instanceof Error ? error.message : "Unknown test error.";
        setStatus({ detail, name, status: "error" });
    }

    function sendManualException() {
        const testName = "manual_capture_exception";
        try {
            const error = new Error(
                `PostHog manual exception test at ${new Date().toISOString()}`,
            );
            posthog.captureException(error, {
                origin: "posthog-errors-page",
                testName,
            });
            markOk(
                testName,
                "Called posthog.captureException(error). Check PostHog Error Tracking.",
            );
        } catch (error) {
            markError(testName, error);
        }
    }

    function throwUnhandledError() {
        const testName = "unhandled_error_autocapture";
        markOk(
            testName,
            "Scheduling unhandled throw. This should be autocaptured by PostHog.",
        );

        setTimeout(() => {
            throw new Error(
                `PostHog unhandled error test at ${new Date().toISOString()}`,
            );
        }, 0);
    }

    function throwUnhandledRejection() {
        const testName = "unhandled_rejection_autocapture";
        markOk(
            testName,
            "Scheduling unhandled rejection. This should be autocaptured by PostHog.",
        );

        setTimeout(() => {
            void Promise.reject(
                new Error(
                    `PostHog unhandled rejection test at ${new Date().toISOString()}`,
                ),
            );
        }, 0);
    }

    const statusClassName =
        status.status === "error"
            ? "text-destructive"
            : status.status === "ok"
              ? "text-green-600"
              : "text-muted-foreground";

    return (
        <div className="rounded-lg border p-6">
            <h2 className="mb-4 font-semibold text-xl">
                PostHog Error Ingestion Test
            </h2>
            <p className="text-sm text-muted-foreground">
                Use these actions to validate both manual and autocaptured
                errors in PostHog.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={sendManualException} type="button">
                    Send Manual Exception
                </Button>
                <Button
                    onClick={throwUnhandledError}
                    type="button"
                    variant="secondary"
                >
                    Trigger Unhandled Error
                </Button>
                <Button
                    onClick={throwUnhandledRejection}
                    type="button"
                    variant="outline"
                >
                    Trigger Unhandled Rejection
                </Button>
            </div>

            <p className={`mt-4 text-sm ${statusClassName}`}>
                <span className="font-medium">{status.name}:</span>{" "}
                {status.detail}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
                After clicking, open PostHog Error Tracking and filter by recent
                issues.
            </p>
        </div>
    );
}
