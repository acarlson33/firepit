import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/rate-limit";

const CORS_MAX_AGE = 60 * 60 * 24; // 24 hours

function getCorsOrigins(): string[] {
    const configured = process.env.FIREPIT_CORS_ORIGINS?.trim();
    if (!configured || configured === "*") {
        return ["*"];
    }
    return configured.split(",").map((o) => o.trim());
}

function isValidOrigin(origin: string | null, allowedOrigins: string[]): boolean {
    if (!origin) {
        return false;
    }
    if (allowedOrigins.includes("*")) {
        return true;
    }
    return allowedOrigins.includes(origin);
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!pathname.startsWith("/api")) {
        return NextResponse.next();
    }

    const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
    if (rateLimitEnabled) {
        const rateLimitResult = rateLimitRequest(request, pathname);

        if (!rateLimitResult.allowed) {
            const response = new NextResponse(
                JSON.stringify({
                    error: "RATE_LIMIT_EXCEEDED",
                    message: "Too many requests. Please try again later.",
                    retryAfter: rateLimitResult.retryAfter,
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": String(rateLimitResult.retryAfter ?? Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": String(rateLimitResult.resetAt),
                    },
                },
            );

            return response;
        }

        request.headers.set(
            "X-RateLimit-Remaining",
            String(rateLimitResult.remaining),
        );
        request.headers.set(
            "X-RateLimit-Reset",
            String(rateLimitResult.resetAt),
        );
    }

    const origin = request.headers.get("origin");
    const allowedOrigins = getCorsOrigins();
    const responseOrigin = isValidOrigin(origin, allowedOrigins)
        ? origin
        : allowedOrigins.includes("*")
          ? "*"
          : allowedOrigins[0] ?? "";

    const corsHeaders = new Headers();

    if (responseOrigin) {
        corsHeaders.set("Access-Control-Allow-Origin", responseOrigin);
        corsHeaders.set("Vary", "Origin");
    }

    corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    corsHeaders.set("Access-Control-Allow-Credentials", "true");
    corsHeaders.set("Access-Control-Max-Age", String(CORS_MAX_AGE));

    if (request.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
    corsHeaders.set("X-Request-ID", requestId);

    const response = NextResponse.next({
        request: {
            headers: new Headers(request.headers),
        },
    });

    corsHeaders.forEach((value, key) => {
        response.headers.set(key, value);
    });

    response.headers.set("X-Request-ID", requestId);

    return response;
}

export const config = {
    matcher: "/api/:path*",
};
