"use client";

import posthog from "posthog-js";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type DebugResult = {
    detail: string;
    name: string;
    status: "idle" | "ok" | "error";
};

export function PostHogDebugPanel() {
    const [lastResult, setLastResult] = useState<DebugResult>({
        detail: "No debug event fired yet.",
        name: "none",
        status: "idle",
    });

    const diagnostics = useMemo(() => {
        const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

        return {
            host,
            tokenPreview:
                typeof token === "string" && token.length > 8
                    ? `${token.slice(0, 8)}...`
                    : "missing",
        };
    }, []);

    function markOk(name: string, detail: string) {
        setLastResult({ detail, name, status: "ok" });
    }

    function markError(name: string, error: unknown) {
        const detail =
            error instanceof Error ? error.message : "Unknown PostHog error.";
        setLastResult({ detail, name, status: "error" });
    }

    function captureDebugEvent() {
        const eventName = "debug_client_capture";
        try {
            posthog.capture(eventName, {
                origin: "profile-debug",
                ts: Date.now(),
            });
            markOk(eventName, "Queued capture event.");
        } catch (error) {
            markError(eventName, error);
        }
    }

    function captureInstantDebugEvent() {
        const eventName = "debug_client_capture_instant";
        try {
            posthog.capture(
                eventName,
                {
                    origin: "profile-debug",
                    ts: Date.now(),
                },
                { send_instantly: true },
            );
            markOk(
                eventName,
                "Sent with send_instantly=true. This should appear in network immediately.",
            );
        } catch (error) {
            markError(eventName, error);
        }
    }

    function identifyAndCaptureDebugEvent() {
        const eventName = "debug_client_identify_capture";
        const distinctId = `debug-user-${Date.now()}`;
        try {
            posthog.identify(distinctId);
            posthog.capture(
                eventName,
                {
                    distinctId,
                    origin: "profile-debug",
                    ts: Date.now(),
                },
                { send_instantly: true },
            );
            markOk(
                eventName,
                `Identified as ${distinctId} and captured event instantly.`,
            );
        } catch (error) {
            markError(eventName, error);
        }
    }

    function resetPostHogIdentity() {
        const eventName = "debug_reset";
        try {
            posthog.reset();
            markOk(eventName, "PostHog identity reset complete.");
        } catch (error) {
            markError(eventName, error);
        }
    }

    async function probePostHogHost() {
        const eventName = "debug_host_probe";
        const host = diagnostics.host;
        if (!host) {
            markError(
                eventName,
                new Error("NEXT_PUBLIC_POSTHOG_HOST is missing."),
            );
            return;
        }

        try {
            const response = await fetch(`${host}/e/`, {
                credentials: "omit",
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    api_key: "debug_probe",
                    batch: [],
                }),
            });

            markOk(
                eventName,
                `Host reachable. Status ${response.status}. Check network request details for CORS or proxy behavior.`,
            );
        } catch (error) {
            markError(eventName, error);
        }
    }

    const statusClassName =
        lastResult.status === "error"
            ? "text-destructive"
            : lastResult.status === "ok"
              ? "text-green-600"
              : "text-muted-foreground";

    return (
        <div className="rounded-lg border p-6">
            <h2 className="mb-4 font-semibold text-xl">PostHog Event Debug</h2>

            <div className="space-y-2 text-sm">
                <p>
                    <span className="font-medium">Host:</span>{" "}
                    {diagnostics.host ?? "missing"}
                </p>
                <p>
                    <span className="font-medium">Token:</span>{" "}
                    {diagnostics.tokenPreview}
                </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
                <Button
                    onClick={captureDebugEvent}
                    type="button"
                    variant="outline"
                >
                    Capture Event
                </Button>
                <Button onClick={captureInstantDebugEvent} type="button">
                    Capture Instant Event
                </Button>
                <Button
                    onClick={identifyAndCaptureDebugEvent}
                    type="button"
                    variant="secondary"
                >
                    Identify + Capture
                </Button>
                <Button
                    onClick={resetPostHogIdentity}
                    type="button"
                    variant="ghost"
                >
                    Reset Identity
                </Button>
                <Button
                    onClick={probePostHogHost}
                    type="button"
                    variant="outline"
                >
                    Probe Host
                </Button>
            </div>

            <p className={`mt-4 text-sm ${statusClassName}`}>
                <span className="font-medium">{lastResult.name}:</span>{" "}
                {lastResult.detail}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
                Watch browser console for [PostHog][client] logs and network
                requests to your PostHog host.
            </p>
        </div>
    );
}
