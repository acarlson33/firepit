import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth-server";
import {
    GifSearchValidationError,
    getGifProvider,
    getGiphyConfig,
    getTenorConfig,
    isGifSearchEnabled,
    isGifStickerSupportEnabled,
    mapGiphyResults,
    mapTenorResults,
    parseGifSearchParams,
    type GiphySearchResponse,
    type TenorSearchResponse,
} from "@/lib/gif-sticker";
import { logger, setTransactionName, trackApiCall } from "@/lib/newrelic-utils";
import { checkRateLimit } from "@/lib/rate-limiter";

const GIPHY_BASE_URL = "https://api.giphy.com/v1/gifs/search";
const TENOR_BASE_URL = "https://tenor.googleapis.com/v2/search";

function jsonResponse(data: unknown, init?: ResponseInit) {
    return NextResponse.json(data, init);
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
    );
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/gifs/search");

        if (!(await isGifStickerSupportEnabled())) {
            return jsonResponse(
                { error: "GIF/sticker support is disabled" },
                { status: 404 },
            );
        }

        if (!(await isGifSearchEnabled())) {
            return jsonResponse(
                { error: "GIF search is disabled" },
                { status: 404 },
            );
        }

        const user = await requireAuth();

        const rateLimitResult = checkRateLimit(`gif-search:${user.$id}`, {
            maxRequests: 30,
            windowMs: 60 * 1000,
        });

        if (!rateLimitResult.allowed) {
            return jsonResponse(
                {
                    error: "Too many GIF searches. Please try again shortly.",
                    retryAfter: rateLimitResult.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter || 60),
                    },
                },
            );
        }

        const params = parseGifSearchParams(request.nextUrl.searchParams);
        const provider = getGifProvider();
        const url =
            provider === "giphy"
                ? new URL(GIPHY_BASE_URL)
                : new URL(TENOR_BASE_URL);

        if (provider === "giphy") {
            const giphyConfig = getGiphyConfig();
            if (!giphyConfig.apiKey) {
                logger.warn("GIPHY_API_KEY missing while GIF search is enabled");
                return jsonResponse(
                    { error: "GIF provider is not configured" },
                    { status: 503 },
                );
            }

            const cursorOffset = Number(params.cursor ?? "0");
            const offset =
                Number.isFinite(cursorOffset) && cursorOffset >= 0
                    ? Math.floor(cursorOffset)
                    : 0;

            url.searchParams.set("api_key", giphyConfig.apiKey);
            url.searchParams.set("q", params.query);
            url.searchParams.set("limit", String(params.limit));
            url.searchParams.set("offset", String(offset));
            url.searchParams.set("lang", giphyConfig.lang);
            url.searchParams.set("rating", giphyConfig.rating);
            url.searchParams.set("bundle", "messaging_non_clips");
        } else {
            const tenorConfig = getTenorConfig();
            if (!tenorConfig.apiKey) {
                logger.warn("TENOR_API_KEY missing while GIF search is enabled");
                return jsonResponse(
                    { error: "GIF provider is not configured" },
                    { status: 503 },
                );
            }

            if (!tenorConfig.clientKey) {
                logger.warn(
                    "TENOR_CLIENT_KEY missing while GIF search is enabled",
                );
                return jsonResponse(
                    { error: "GIF provider is not configured" },
                    { status: 503 },
                );
            }

            url.searchParams.set("key", tenorConfig.apiKey);
            url.searchParams.set("client_key", tenorConfig.clientKey);
            url.searchParams.set("q", params.query);
            url.searchParams.set("limit", String(params.limit));
            url.searchParams.set(
                "media_filter",
                "gif,mediumgif,tinygif,tinygifpreview",
            );
            url.searchParams.set("contentfilter", params.contentFilter);
            url.searchParams.set("locale", tenorConfig.locale);
            if (params.cursor) {
                url.searchParams.set("pos", params.cursor);
            }
        }

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            const details = await response.text().catch(() => "");
            logger.warn("GIF search provider request failed", {
                status: response.status,
                details,
                provider,
            });
            return jsonResponse(
                { error: "GIF search is temporarily unavailable" },
                { status: 502 },
            );
        }

        const normalized =
            provider === "giphy"
                ? mapGiphyResults({
                      payload: (await response.json()) as GiphySearchResponse,
                      requestedLimit: params.limit,
                      requestedCursor: params.cursor,
                  })
                : mapTenorResults((await response.json()) as TenorSearchResponse);

        trackApiCall(
            "/api/gifs/search",
            "GET",
            200,
            Date.now() - startTime,
            {
                itemCount: normalized.items.length,
                provider,
                queryLength: params.query.length,
            },
        );

        return jsonResponse(normalized);
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonResponse({ error: error.message }, { status: 401 });
        }

        if (error instanceof GifSearchValidationError) {
            return jsonResponse({ error: error.message }, { status: 400 });
        }

        if (isAbortError(error)) {
            trackApiCall(
                "/api/gifs/search",
                "GET",
                504,
                Date.now() - startTime,
            );
            return jsonResponse(
                { error: "GIF search timed out" },
                { status: 504 },
            );
        }

        logger.error("Failed to search GIFs", {
            error: error instanceof Error ? error.message : String(error),
        });

        trackApiCall(
            "/api/gifs/search",
            "GET",
            500,
            Date.now() - startTime,
        );

        return jsonResponse(
            { error: "Failed to search GIFs" },
            { status: 500 },
        );
    }
}
