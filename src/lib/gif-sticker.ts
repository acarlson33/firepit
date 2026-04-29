import type { GifSearchItem, StickerPack } from "@/lib/types";

type TenorContentFilter = "off" | "low" | "medium" | "high";
type GifProvider = "giphy" | "tenor";

type GifSearchParams = {
    cursor?: string;
    limit: number;
    query: string;
    contentFilter: TenorContentFilter;
};

export class GifSearchValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GifSearchValidationError";
    }
}

export type TenorSearchResponse = {
    results?: Array<{
        id?: string;
        content_description?: string;
        title?: string;
        media_formats?: Record<
            string,
            {
                url?: string;
                duration?: number;
                dims?: [number, number];
            }
        >;
    }>;
    next?: string;
};

export type GiphySearchResponse = {
    data?: Array<{
        id?: string;
        title?: string;
        slug?: string;
        images?: {
            original?: {
                url?: string;
                width?: string;
                height?: string;
            };
            downsized?: {
                url?: string;
            };
            fixed_width?: {
                url?: string;
            };
            downsized_still?: {
                url?: string;
            };
            fixed_width_still?: {
                url?: string;
            };
            preview_gif?: {
                url?: string;
            };
        };
    }>;
    pagination?: {
        offset?: number;
        count?: number;
        total_count?: number;
    };
};

function toStringValue(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function toDims(value: unknown): { width?: number; height?: number } {
    if (!Array.isArray(value) || value.length !== 2) {
        return {};
    }

    const width = Number(value[0]);
    const height = Number(value[1]);

    return {
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined,
    };
}

function normalizeContentFilter(value: string | null): TenorContentFilter {
    if (!value) {
        return "medium";
    }

    const normalized = value.toLowerCase();
    if (
        normalized === "off" ||
        normalized === "low" ||
        normalized === "medium" ||
        normalized === "high"
    ) {
        return normalized;
    }

    return "medium";
}

export function parseGifSearchParams(searchParams: URLSearchParams): GifSearchParams {
    const query = toStringValue(searchParams.get("q"));
    if (!query) {
        throw new GifSearchValidationError("Query parameter q is required");
    }

    const limitRaw = Number(searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(Math.floor(limitRaw), 30))
        : 20;

    const cursor = toStringValue(searchParams.get("cursor"));

    return {
        cursor,
        limit,
        query,
        contentFilter: normalizeContentFilter(searchParams.get("contentfilter")),
    };
}

export function mapTenorResults(payload: TenorSearchResponse): {
    items: GifSearchItem[];
    next?: string;
} {
    const items: GifSearchItem[] = [];
    const rawResults = Array.isArray(payload.results) ? payload.results : [];

    for (const rawResult of rawResults) {
        const id = toStringValue(rawResult.id);
        if (!id) {
            continue;
        }

        const mediaFormats = rawResult.media_formats;
        if (!mediaFormats || typeof mediaFormats !== "object") {
            continue;
        }

        const preferredFormat =
            mediaFormats.gif ?? mediaFormats.mediumgif ?? mediaFormats.tinygif;
        if (!preferredFormat || typeof preferredFormat !== "object") {
            continue;
        }

        const gifUrl = toStringValue(preferredFormat.url);
        if (!gifUrl) {
            continue;
        }

        const previewFormat =
            mediaFormats.tinygifpreview ??
            mediaFormats.nanogifpreview ??
            mediaFormats.gifpreview;
        const previewUrl =
            previewFormat && typeof previewFormat === "object"
                ? toStringValue(previewFormat.url)
                : undefined;

        const dims = toDims(preferredFormat.dims);
        const durationRaw = Number(preferredFormat.duration);

        items.push({
            id,
            title:
                toStringValue(rawResult.content_description) ??
                toStringValue(rawResult.title) ??
                "GIF",
            gifUrl,
            previewUrl,
            width: dims.width,
            height: dims.height,
            durationMs:
                Number.isFinite(durationRaw) && durationRaw > 0
                    ? Math.round(durationRaw * 1000)
                    : undefined,
            source: "tenor",
        });
    }

    return {
        items,
        next: toStringValue(payload.next),
    };
}

function toPositiveInt(value: unknown): number | undefined {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return undefined;
    }

    return Math.floor(num);
}

function parseCursorOffset(cursor?: string): number {
    if (!cursor) {
        return 0;
    }

    const parsed = Number(cursor);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return Math.floor(parsed);
}

export function mapGiphyResults(params: {
    payload: GiphySearchResponse;
    requestedLimit: number;
    requestedCursor?: string;
}): {
    items: GifSearchItem[];
    next?: string;
} {
    const { payload, requestedLimit, requestedCursor } = params;
    const items: GifSearchItem[] = [];
    const rawItems = Array.isArray(payload.data) ? payload.data : [];

    for (const rawItem of rawItems) {
        const id = toStringValue(rawItem.id);
        if (!id) {
            continue;
        }

        const original = rawItem.images?.original;
        const gifUrl =
            toStringValue(original?.url) ||
            toStringValue(rawItem.images?.downsized?.url) ||
            toStringValue(rawItem.images?.fixed_width?.url);
        if (!gifUrl) {
            continue;
        }

        const previewUrl =
            toStringValue(rawItem.images?.downsized_still?.url) ||
            toStringValue(rawItem.images?.fixed_width_still?.url) ||
            toStringValue(rawItem.images?.preview_gif?.url);

        items.push({
            id,
            title:
                toStringValue(rawItem.title) ||
                toStringValue(rawItem.slug) ||
                "GIF",
            gifUrl,
            previewUrl,
            width: toPositiveInt(original?.width),
            height: toPositiveInt(original?.height),
            source: "giphy",
        });
    }

    const pagination = payload.pagination;
    const total = Number(pagination?.total_count);
    const count = Number(pagination?.count ?? requestedLimit);
    const nextOffset = parseCursorOffset(requestedCursor) +
        (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : requestedLimit);

    const next =
        Number.isFinite(total) && total > nextOffset ? String(nextOffset) : undefined;

    return {
        items,
        next,
    };
}

export function getTenorConfig() {
    const apiKey = process.env.TENOR_API_KEY?.trim() || "";
    const clientKey = process.env.TENOR_CLIENT_KEY?.trim() || "firepit-web";
    const locale = process.env.TENOR_LOCALE?.trim() || "en_US";

    return { apiKey, clientKey, locale };
}

export function getGiphyConfig() {
    const apiKey = process.env.GIPHY_API_KEY?.trim() || "";
    const rating = process.env.GIPHY_RATING?.trim().toLowerCase() || "g";
    const lang = process.env.GIPHY_LANG?.trim() || "en";

    return { apiKey, lang, rating };
}

export function getGifProvider(): GifProvider {
    const configured = process.env.GIF_PROVIDER?.trim().toLowerCase();
    if (configured === "tenor") {
        return "tenor";
    }

    return "giphy";
}

export function getBuiltinStickerPacks(): StickerPack[] {
    return [
        {
            id: "builtin-hello",
            name: "Starter Stickers",
            description: "Small built-in pack for launch and smoke testing",
            source: "builtin",
            items: [
                {
                    id: "wave",
                    name: "Wave",
                    mediaUrl:
                        "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f44b.png",
                    source: "builtin_sticker",
                    packId: "builtin-hello",
                },
                {
                    id: "party",
                    name: "Party",
                    mediaUrl:
                        "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f389.png",
                    source: "builtin_sticker",
                    packId: "builtin-hello",
                },
                {
                    id: "thumbs-up",
                    name: "Thumbs Up",
                    mediaUrl:
                        "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f44d.png",
                    source: "builtin_sticker",
                    packId: "builtin-hello",
                },
                {
                    id: "sparkles",
                    name: "Sparkles",
                    mediaUrl:
                        "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2728.png",
                    source: "builtin_sticker",
                    packId: "builtin-hello",
                },
            ],
        },
    ];
}
