"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log critical error to New Relic
    if (typeof window !== "undefined") {
      const newrelic = (window as unknown as { newrelic?: { noticeError: (error: Error, attrs?: Record<string, unknown>) => void } }).newrelic;
      if (newrelic) {
        newrelic.noticeError(error, {
          level: "critical",
          source: "global-error-boundary",
        });
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
          <div className="text-center max-w-md">
            {/* Critical Error Icon */}
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-destructive/10 p-6">
                <AlertTriangle className="h-16 w-16 text-destructive" />
              </div>
            </div>

            {/* Error Message */}
            <div className="mb-8 space-y-3">
              <h1 className="font-bold text-3xl">Critical Error</h1>
              <p className="text-muted-foreground">
                A critical error occurred that prevented the application from loading.
                Please try refreshing the page.
              </p>
              {error.digest && (
                <p className="font-mono text-xs text-muted-foreground">
                  Error ID: {error.digest}
                </p>
              )}
            </div>

            {/* Action Button */}
            <Button onClick={reset} size="lg" className="min-w-40">
              <RefreshCcw className="mr-2 h-5 w-5" />
              Reload Application
            </Button>

            {/* Development Mode Error Details */}
            {process.env.NODE_ENV === "development" && (
              <details className="mt-8 rounded-lg border border-border bg-card p-4 text-left">
                <summary className="cursor-pointer font-semibold text-sm">
                  Error Details (Development Only)
                </summary>
                <pre className="mt-3 overflow-auto text-xs text-destructive">
                  {error.message}
                  {"\n\n"}
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Contact Support */}
            <p className="mt-8 text-xs text-muted-foreground">
              If this error persists, please contact support with the Error ID above.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
