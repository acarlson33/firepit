"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FileAttachment, GifSearchItem, StickerPack } from "@/lib/types";

const DEFAULT_GIF_QUERY = "trending";

type PickerMode = "gifs" | "stickers";

type GifSearchResponse = {
    items?: GifSearchItem[];
    next?: string;
};

type StickerResponse = {
    packs?: StickerPack[];
};

type GifStickerPickerProps = {
    onSelectAttachment: (attachment: FileAttachment) => void;
    disabled?: boolean;
};

function inferImageMimeType(url: string): string {
    let pathname = url;

    try {
        pathname = new URL(url).pathname;
    } catch {
        pathname = url.split("?")[0] ?? url;
    }

    const normalizedPathname = pathname.toLowerCase();

    if (/\.gif$/.test(normalizedPathname)) {
        return "image/gif";
    }
    if (/\.webp$/.test(normalizedPathname)) {
        return "image/webp";
    }
    if (/\.jpe?g$/.test(normalizedPathname)) {
        return "image/jpeg";
    }

    return "image/png";
}

function mimeTypeToExtension(mimeType: string): string {
    switch (mimeType) {
        case "image/webp": {
            return "webp";
        }
        case "image/jpeg": {
            return "jpg";
        }
        case "image/png": {
            return "png";
        }
        default: {
            return "gif";
        }
    }
}

function toSafeFileBaseName(value: string | undefined): string {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
        return "gif";
    }

    const sanitized = trimmed
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");

    return sanitized || "gif";
}

function toGifAttachment(item: GifSearchItem): FileAttachment {
    const fileType = inferImageMimeType(item.gifUrl);
    const fileExtension = mimeTypeToExtension(fileType);
    const safeTitle = toSafeFileBaseName(item.title);

    return {
        fileId: `${item.source}-${item.id}`,
        fileName: `${safeTitle}.${fileExtension}`,
        fileSize: 0,
        fileType,
        fileUrl: item.gifUrl,
        thumbnailUrl: item.previewUrl,
        previewUrl: item.previewUrl,
        mediaKind: "gif",
        source: item.source,
        provider: item.source,
        providerAssetId: item.id,
    };
}

function toStickerAttachment(params: {
    item: StickerPack["items"][number];
    pack: StickerPack;
}): FileAttachment {
    const { item, pack } = params;

    return {
        fileId: `sticker-${pack.id}-${item.id}`,
        fileName: `${toSafeFileBaseName(item.name || item.id)}.sticker`,
        fileSize: 0,
        fileType: inferImageMimeType(item.mediaUrl),
        fileUrl: item.mediaUrl,
        thumbnailUrl: item.previewUrl,
        previewUrl: item.previewUrl,
        mediaKind: "sticker",
        source: item.source,
        packId: pack.id,
        itemId: item.id,
    };
}

export function GifStickerPicker({
    onSelectAttachment,
    disabled = false,
}: GifStickerPickerProps) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<PickerMode>("gifs");
    const [query, setQuery] = useState("");
    const [gifSearchQuery, setGifSearchQuery] =
        useState(DEFAULT_GIF_QUERY);
    const [hasFetchedGifs, setHasFetchedGifs] = useState(false);

    const [gifResults, setGifResults] = useState<GifSearchItem[]>([]);
    const [gifNextCursor, setGifNextCursor] = useState<string | undefined>();
    const [gifLoading, setGifLoading] = useState(false);
    const [gifLoadingMore, setGifLoadingMore] = useState(false);
    const [gifError, setGifError] = useState<string | null>(null);
    const [gifDisabled, setGifDisabled] = useState(false);

    const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
    const [stickerLoading, setStickerLoading] = useState(false);
    const [stickerError, setStickerError] = useState<string | null>(null);
    const [stickerDisabled, setStickerDisabled] = useState(false);
    const [stickersLoaded, setStickersLoaded] = useState(false);
    const gifFetchControllerRef = useRef<AbortController | null>(null);

    const normalizedQuery = query.trim();

    const fetchGifs = useCallback(
        async (options?: {
            append?: boolean;
            cursor?: string;
            query?: string;
        }) => {
            const append = options?.append === true;
            const cursor = options?.cursor;
            const searchQuery =
                options?.query?.trim() || gifSearchQuery || DEFAULT_GIF_QUERY;

            if (!append) {
                gifFetchControllerRef.current?.abort();
            }

            const controller = new AbortController();
            gifFetchControllerRef.current = controller;

            if (append) {
                setGifLoadingMore(true);
            } else {
                setHasFetchedGifs(true);
                setGifLoading(true);
                setGifError(null);
            }

            try {
                const params = new URLSearchParams({
                    q: searchQuery,
                    limit: "24",
                });
                if (cursor) {
                    params.set("cursor", cursor);
                }

                const response = await fetch(`/api/gifs/search?${params.toString()}`, {
                    signal: controller.signal,
                });

                if (response.status === 404) {
                    setGifDisabled(true);
                    setGifResults([]);
                    setGifNextCursor(undefined);
                    setGifError("GIF search is not enabled yet.");
                    return;
                }

                if (!response.ok) {
                    const body = (await response.json().catch(() => null)) as
                        | { error?: string }
                        | null;
                    throw new Error(body?.error || "Failed to search GIFs");
                }

                setGifDisabled(false);
                const payload = (await response.json()) as GifSearchResponse;
                const items = Array.isArray(payload.items) ? payload.items : [];

                if (!append) {
                    setGifSearchQuery(searchQuery);
                }
                setGifResults((prev) => (append ? [...prev, ...items] : items));
                setGifNextCursor(payload.next);
                setGifError(null);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }

                setGifError(
                    error instanceof Error ? error.message : "Failed to search GIFs",
                );
                if (!append) {
                    setGifResults([]);
                    setGifNextCursor(undefined);
                }
            } finally {
                if (gifFetchControllerRef.current === controller) {
                    gifFetchControllerRef.current = null;
                }
                setGifLoading(false);
                setGifLoadingMore(false);
            }
        },
        [gifSearchQuery],
    );

    useEffect(() => {
        return () => {
            gifFetchControllerRef.current?.abort();
        };
    }, []);

    const submitGifSearch = useCallback(() => {
        if (mode !== "gifs") {
            return;
        }

        const searchQuery = query.trim() || DEFAULT_GIF_QUERY;
        void fetchGifs({ query: searchQuery });
    }, [fetchGifs, mode, query]);

    const fetchStickers = useCallback(async () => {
        setStickerLoading(true);
        setStickerError(null);

        try {
            const response = await fetch("/api/stickers");

            if (response.status === 404) {
                setStickerDisabled(true);
                setStickerPacks([]);
                setStickerError("Stickers are not enabled yet.");
                return;
            }

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(body?.error || "Failed to load stickers");
            }

            const payload = (await response.json()) as StickerResponse;
            setStickerPacks(Array.isArray(payload.packs) ? payload.packs : []);
            setStickerDisabled(false);
            setStickerError(null);
        } catch (error) {
            setStickerError(
                error instanceof Error
                    ? error.message
                    : "Failed to load stickers",
            );
            setStickerPacks([]);
        } finally {
            setStickerLoading(false);
            setStickersLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (!open || mode !== "gifs" || hasFetchedGifs) {
            return;
        }

        void fetchGifs({ query: DEFAULT_GIF_QUERY });
    }, [open, mode, fetchGifs, hasFetchedGifs]);

    useEffect(() => {
        if (!open || mode !== "stickers" || stickersLoaded) {
            return;
        }

        void fetchStickers();
    }, [open, mode, stickersLoaded, fetchStickers]);

    const filteredStickerPacks = useMemo(() => {
        if (!normalizedQuery) {
            return stickerPacks;
        }

        const search = normalizedQuery.toLowerCase();

        return stickerPacks
            .map((pack) => {
                const packMatches = pack.name.toLowerCase().includes(search);
                const items = pack.items.filter((item) =>
                    (item.name ?? "").toLowerCase().includes(search),
                );

                if (packMatches) {
                    return pack;
                }

                return { ...pack, items };
            })
            .filter((pack) => pack.items.length > 0);
    }, [normalizedQuery, stickerPacks]);

    return (
        <>
            <Button
                aria-label="Browse GIFs and stickers"
                className="shrink-0"
                disabled={disabled}
                onClick={() => {
                    if (!disabled) {
                        setOpen(true);
                    }
                }}
                size="icon"
                title="Browse GIFs and stickers"
                type="button"
                variant="ghost"
            >
                <Film className="size-5" />
            </Button>

            <Dialog onOpenChange={setOpen} open={open}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>GIFs and Stickers</DialogTitle>
                        <DialogDescription>
                            Search GIFs and browse sticker packs.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => {
                                    setMode("gifs");
                                }}
                                size="sm"
                                type="button"
                                variant={mode === "gifs" ? "default" : "outline"}
                            >
                                GIFs
                            </Button>
                            <Button
                                onClick={() => {
                                    setMode("stickers");
                                }}
                                size="sm"
                                type="button"
                                variant={
                                    mode === "stickers" ? "default" : "outline"
                                }
                            >
                                Stickers
                            </Button>
                        </div>

                        <div className="relative">
                            <Label className="sr-only" htmlFor="gif-sticker-search">
                                Search GIFs and stickers
                            </Label>
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="gif-sticker-search"
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                }}
                                onKeyDown={(event) => {
                                    if (mode === "gifs" && event.key === "Enter") {
                                        event.preventDefault();
                                        submitGifSearch();
                                    }
                                }}
                                placeholder={
                                    mode === "gifs"
                                        ? "Search GIFs"
                                        : "Search stickers"
                                }
                                value={query}
                            />
                        </div>
                        {mode === "gifs" ? (
                            <p className="text-xs text-muted-foreground">
                                Press Enter to search GIFs.
                            </p>
                        ) : null}

                        {mode === "gifs" ? (
                            <div className="space-y-3">
                                {gifDisabled && (
                                    <p className="text-sm text-muted-foreground">
                                        GIF search is currently disabled.
                                    </p>
                                )}
                                {gifError && !gifDisabled && (
                                    <p className="text-sm text-destructive">
                                        {gifError}
                                    </p>
                                )}

                                {gifLoading ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid max-h-105 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                                            {gifResults.map((item) => (
                                                <button
                                                    className="overflow-hidden rounded-lg border border-border/60 bg-muted/20 text-left transition hover:border-primary/60 hover:bg-muted/40"
                                                    key={`${item.source}-${item.id}`}
                                                    onClick={() => {
                                                        onSelectAttachment(
                                                            toGifAttachment(item),
                                                        );
                                                        setOpen(false);
                                                    }}
                                                    type="button"
                                                >
                                                    <div className="relative h-36 w-full">
                                                        <Image
                                                            alt={item.title || "GIF"}
                                                            className="object-cover"
                                                            fill
                                                            loading="lazy"
                                                            sizes="(min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                                                            src={item.previewUrl || item.gifUrl}
                                                            unoptimized
                                                        />
                                                    </div>
                                                    <div className="px-2 py-1 text-xs text-muted-foreground">
                                                        {item.title || "GIF"}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {gifResults.length === 0 && !gifError ? (
                                            <p className="text-sm text-muted-foreground">
                                                No GIFs found.
                                            </p>
                                        ) : null}

                                        {gifNextCursor && !gifDisabled ? (
                                            <Button
                                                disabled={gifLoadingMore}
                                                onClick={() => {
                                                    void fetchGifs({
                                                        append: true,
                                                        cursor: gifNextCursor,
                                                        query: gifSearchQuery,
                                                    });
                                                }}
                                                type="button"
                                                variant="outline"
                                            >
                                                {gifLoadingMore ? (
                                                    <>
                                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                                        Loading...
                                                    </>
                                                ) : (
                                                    "Load more"
                                                )}
                                            </Button>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stickerDisabled && (
                                    <p className="text-sm text-muted-foreground">
                                        Sticker browsing is currently disabled.
                                    </p>
                                )}
                                {stickerError && !stickerDisabled ? (
                                    <p className="text-sm text-destructive">
                                        {stickerError}
                                    </p>
                                ) : null}

                                {stickerLoading ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="max-h-105 space-y-4 overflow-y-auto pr-1">
                                        {filteredStickerPacks.map((pack) => (
                                            <section key={pack.id}>
                                                <h3 className="mb-2 text-sm font-semibold">
                                                    {pack.name}
                                                </h3>
                                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                                                    {pack.items.map((item) => (
                                                        <button
                                                            className="overflow-hidden rounded-lg border border-border/60 bg-muted/20 transition hover:border-primary/60 hover:bg-muted/40"
                                                            key={item.id}
                                                            onClick={() => {
                                                                onSelectAttachment(
                                                                    toStickerAttachment(
                                                                        {
                                                                            item,
                                                                            pack,
                                                                        },
                                                                    ),
                                                                );
                                                                setOpen(false);
                                                            }}
                                                            title={item.name || "Sticker"}
                                                            type="button"
                                                        >
                                                            <div className="relative aspect-square w-full">
                                                                <Image
                                                                    alt={item.name || "Sticker"}
                                                                    className="object-cover"
                                                                    fill
                                                                    loading="lazy"
                                                                    sizes="(min-width: 768px) 16vw, (min-width: 640px) 20vw, 33vw"
                                                                    src={item.previewUrl || item.mediaUrl}
                                                                    unoptimized
                                                                />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        ))}
                                        {filteredStickerPacks.length === 0 &&
                                        !stickerError ? (
                                            <p className="text-sm text-muted-foreground">
                                                No stickers found.
                                            </p>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
