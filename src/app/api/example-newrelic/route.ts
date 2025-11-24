/**
 * Example API Route with New Relic Integration
 * 
 * This demonstrates how to use New Relic utilities for comprehensive monitoring:
 * - Transaction naming
 * - Error tracking
 * - Custom events
 * - Performance metrics
 * - Structured logging
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  logger,
  recordError,
  setTransactionName,
  trackApiCall,
  measureAsync,
  addTransactionAttributes,
} from "@/lib/posthog-utils";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Set a meaningful transaction name for better New Relic organization
    setTransactionName("GET /api/example");
    
    // Add custom attributes to this transaction
    addTransactionAttributes({
      endpoint: "/api/example",
      method: "GET",
      userAgent: request.headers.get("user-agent") || "unknown",
    });
    
    // Log the request
    logger.info("Processing example API request", {
      url: request.url,
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
    
    logger.info("Example API request completed", {
      duration,
      statusCode: 200,
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Record the error in New Relic
    recordError(error instanceof Error ? error : String(error), {
      endpoint: "/api/example",
      method: "GET",
    });
    
    // Track the failed API call
    trackApiCall("/api/example", "GET", 500, duration, {
      error: true,
    });
    
    logger.error("Example API request failed", {
      error: error instanceof Error ? error.message : String(error),
      duration,
    });
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
