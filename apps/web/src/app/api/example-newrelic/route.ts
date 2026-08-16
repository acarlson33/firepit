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

    try {
        addTransactionAttributes({
            endpoint: ENDPOINT,
            method: "GET",
            userAgent,
        });
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
