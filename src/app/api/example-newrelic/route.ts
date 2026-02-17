import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
    addTransactionAttributes,
    logger,
    measureAsync,
    recordError,
    setTransactionName,
    trackApiCall,
} from "@/lib/newrelic-utils";

const ENDPOINT = "/api/example";

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // Disable this example endpoint outside development to avoid exposure in prod
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    setTransactionName("GET /api/example");
    
    // Add custom attributes to this transaction
    // Accessing request.headers may throw during prerendering. Read it safely.
    let userAgent = "unknown";
    try {
      userAgent = request.headers.get("user-agent") || "unknown";
    } catch {
      // In prerendering context, accessing headers can cause an early exit. Use fallback.
      userAgent = "unknown";
    }

    addTransactionAttributes({
      endpoint: "/api/example",
      method: "GET",
      userAgent,
    });
    
    // Log the request (access request.url safely in case prerendering blocks access)
    let reqUrl = "unknown";
    try {
      reqUrl = request.url;
    } catch {
      reqUrl = "unknown";
    }

    logger.info("Processing example API request", {
      url: reqUrl,
      method: "GET",
    });
    
    // Simulate some work with performance tracking
    const result = await measureAsync(
      "example-operation",
      async () => {
        // Simulate database query or external API call
        await new Promise(resolve => setTimeout(resolve, 100));
        return { message: "Hello from New Relic instrumented API!" };
      },
      { operation: "example" }
    );
    
    // Track the API call
    const duration = Date.now() - startTime;
    trackApiCall("/api/example", "GET", 200, duration, {
      cached: false,
    });

    try {
        const result = await measureAsync(
            "example-operation",
            async () => ({
                message: "Hello from New Relic instrumented API!",
            }),
            { operation: "example" },
        );

        const duration = Date.now() - startTime;
        trackApiCall(ENDPOINT, "GET", 200, duration, { cached: false });
        logger.info("Example API request succeeded", { duration });

        return NextResponse.json(result);
    } catch (error) {
        const duration = Date.now() - startTime;
        const recordPayload: string | Error =
            error instanceof Error ? error : String(error);
        recordError(recordPayload, { endpoint: ENDPOINT, method: "GET" });
        trackApiCall(ENDPOINT, "GET", 500, duration, { error: true });
        logger.error("Example API request failed", {
            error:
                recordPayload instanceof Error
                    ? recordPayload.message
                    : recordPayload,
            duration,
        });

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
