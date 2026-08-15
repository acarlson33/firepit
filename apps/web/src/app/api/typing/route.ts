import { NextResponse } from "next/server";
import { Permission, Presences, Role } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import { logger } from "@/lib/newrelic-utils";

const DEFAULT_TYPING_EXPIRY_MS = 8000;

function resolveTypingExpiry(expiresAt: string | undefined): string {
    const parsedExpiry =
        typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
    const cappedExpiry = Number.isFinite(parsedExpiry)
        ? Math.min(parsedExpiry, Date.now() + DEFAULT_TYPING_EXPIRY_MS)
        : Date.now() + DEFAULT_TYPING_EXPIRY_MS;
    return new Date(cappedExpiry).toISOString();
}

/**
 * POST /api/typing
 *
 * Upsert a typing presence record. Resolves the userId from the Bearer token
 * (mobile) or session cookie (web), then uses the admin API key client to
 * call presences.upsert with an explicit userId and permissions readable by
 * any authenticated user. The presence id is derived from the session so a
 * client can never upsert or delete another user's presence record.
 */
export async function POST(request: Request) {
    try {
        const { channelId, userName, expiresAt } = (await request.json()) as {
            channelId?: string;
            userName?: string;
            expiresAt?: string;
        };

        if (!channelId) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        // ponytail: no membership check here — records are self-owned, expire in
        // <=8s, and read-protected via Role.users(). A full channel-vs-DM
        // membership lookup would double DB reads on a 2s-poll hot endpoint.
        const { client } = getServerClient();
        const presences = new Presences(client);
        const result = await presences.upsert({
            presenceId: session.$id,
            userId: session.$id,
            status: "typing",
            expiresAt: resolveTypingExpiry(expiresAt),
            metadata: {
                channelId,
                userName: userName || undefined,
            },
            permissions: [
                Permission.read(Role.users()),
            ],
        });

        return NextResponse.json({ success: true, presence: result });
    } catch (error) {
        logger.error("Failed to upsert typing presence", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            {
                error: "Failed to set typing presence",
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/typing
 *
 * Delete a typing presence record. The presence id is derived from the
 * session so a client can only ever delete its own record.
 */
export async function DELETE() {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const { client } = getServerClient();
        const presences = new Presences(client);
        await presences.delete({ presenceId: session.$id });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete typing presence", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            {
                error: "Failed to delete typing presence",
            },
            { status: 500 },
        );
    }
}
