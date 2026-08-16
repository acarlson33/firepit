import { describe, expect, it } from "vitest";

import {
    getGifProvider,
    getBuiltinStickerPacks,
    mapGiphyResults,
    mapTenorResults,
    parseGifSearchParams,
} from "@/lib/gif-sticker";

describe("gif-sticker helpers", () => {
    it("parses search params with sane defaults", () => {
        const params = new URLSearchParams({ q: "wave", limit: "999" });
        const parsed = parseGifSearchParams(params);

        expect(parsed.query).toBe("wave");
        expect(parsed.limit).toBe(30);
        expect(parsed.contentFilter).toBe("medium");
        expect(parsed.cursor).toBeUndefined();
    });

    it("throws when query is missing", () => {
        expect(() => parseGifSearchParams(new URLSearchParams())).toThrow(
            "Query parameter q is required",
        );
    });

    it("maps giphy response to normalized items", () => {
        const mapped = mapGiphyResults({
            payload: {
                data: [
                    {
                        id: "item-2",
                        title: "hello giphy",
                        images: {
                            original: {
                                url: "https://cdn.example.com/item-2.gif",
                                width: "400",
                                height: "300",
                            },
                            downsized_still: {
                                url: "https://cdn.example.com/item-2-preview.gif",
                            },
                        },
                    },
                ],
                pagination: {
                    count: 1,
                    offset: 0,
                    total_count: 100,
                },
            },
            requestedLimit: 1,
            requestedCursor: "0",
        });

        expect(mapped.next).toBe("1");
        expect(mapped.items).toHaveLength(1);
        const firstMappedGiphy = mapped.items.at(0);
        expect(firstMappedGiphy).toBeDefined();
        expect(firstMappedGiphy).toEqual(
            expect.objectContaining({
                id: "item-2",
                title: "hello giphy",
                gifUrl: "https://cdn.example.com/item-2.gif",
                previewUrl: "https://cdn.example.com/item-2-preview.gif",
                width: 400,
                height: 300,
                source: "giphy",
            }),
        );
    });

    it("maps tenor response to normalized items", () => {
        const mapped = mapTenorResults({
            next: "abc",
            results: [
                {
                    id: "item-1",
                    content_description: "hello gif",
                    media_formats: {
                        gif: {
                            url: "https://cdn.example.com/item-1.gif",
                            duration: 1.25,
                            dims: [320, 240],
                        },
                        tinygifpreview: {
                            url: "https://cdn.example.com/item-1-preview.gif",
                        },
                    },
                },
            ],
        });

        expect(mapped.next).toBe("abc");
        expect(mapped.items).toHaveLength(1);
        const firstMappedTenor = mapped.items.at(0);
        expect(firstMappedTenor).toBeDefined();
        expect(firstMappedTenor).toEqual(
            expect.objectContaining({
                id: "item-1",
                title: "hello gif",
                gifUrl: "https://cdn.example.com/item-1.gif",
                previewUrl: "https://cdn.example.com/item-1-preview.gif",
                width: 320,
                height: 240,
                durationMs: 1250,
                source: "tenor",
            }),
        );
    });

    it("defaults to giphy provider", () => {
        expect(getGifProvider()).toBe("giphy");
    });

    it("returns built-in starter sticker pack", () => {
        const packs = getBuiltinStickerPacks();

        expect(packs.length).toBeGreaterThan(0);
        const firstPack = packs.at(0);
        expect(firstPack).toBeDefined();
        expect(firstPack?.id).toBe("builtin-hello");
        expect(firstPack?.items.length).toBeGreaterThan(0);
    });
});
