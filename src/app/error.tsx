"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to New Relic or monitoring service
    if (typeof window !== "undefined") {
      const newrelic = (window as unknown as { newrelic?: { noticeError: (error: Error) => void } }).newrelic;
      if (newrelic) {
        newrelic.noticeError(error);
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Error Icon */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Error Message */}
        <div className="mb-8 space-y-3">
          <h1 className="font-bold text-2xl">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Don't worry, your data is safe.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={reset} size="lg" className="min-w-[140px]">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button asChild variant="outline" size="lg" className="min-w-[140px]">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </div>

        {/* Development Mode Error Details */}
        {process.env.NODE_ENV === "development" && (
          <details className="mt-8 rounded-lg border border-border bg-muted/30 p-4 text-left">
            <summary className="cursor-pointer font-semibold text-sm">
              Error Details (Development Only)
            </summary>
            <pre className="mt-3 overflow-auto text-xs">
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
