import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth-server";
import { getBuiltinStickerPacks } from "@/lib/gif-sticker";
import { setTransactionName, trackApiCall } from "@/lib/newrelic-utils";

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/stickers");

        await requireAuth();

        const packFilter = request.nextUrl.searchParams.get("packId")?.trim();
        const packs = getBuiltinStickerPacks();

        const filteredPacks = packFilter
            ? packs.filter((pack) => pack.id === packFilter)
            : packs;

        trackApiCall(
            "/api/stickers",
            "GET",
            200,
            Date.now() - startTime,
            {
                packCount: filteredPacks.length,
                itemCount: filteredPacks.reduce(
                    (count, pack) => count + pack.items.length,
                    0,
                ),
            },
        );

        return NextResponse.json({ packs: filteredPacks });
    } catch (error) {
        if (error instanceof AuthError) {
            trackApiCall("/api/stickers", "GET", 401, Date.now() - startTime);
            return NextResponse.json({ error: error.message }, { status: 401 });
        }

        trackApiCall("/api/stickers", "GET", 500, Date.now() - startTime);
        return NextResponse.json(
            { error: "Failed to list stickers" },
            { status: 500 },
        );
    }
}
