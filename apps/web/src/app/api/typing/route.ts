import { NextResponse } from "next/server";
import { Account, Client, Permission, Presences, Role } from "node-appwrite";
import { cookies } from "next/headers";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { logger } from "@/lib/newrelic-utils";

async function getUserIdFromSession(): Promise<string | null> {
    const env = getEnvConfig();
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(`a_session_${env.project}`);
    if (!sessionCookie?.value) return null;

    const client = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.project)
        .setSession(sessionCookie.value);

    const account = new Account(client);
    try {
        const user = await account.get();
        return user.$id;
    } catch {
        return null;
    }
}

/**
 * POST /api/typing
 *
 * Upsert a typing presence record. Resolves the userId from the session
 * cookie, then uses the admin API key client to call presences.upsert
 * with an explicit userId and permissions readable by any authenticated user.
 */
export async function POST(request: Request) {
    try {
        const { presenceId, channelId, userName, expiresAt } =
            (await request.json()) as {
                presenceId?: string;
                channelId?: string;
                userName?: string;
                expiresAt?: string;
            };

        if (!presenceId || !channelId) {
            return NextResponse.json(
                { error: "presenceId and channelId are required" },
                { status: 400 },
            );
        }

        const userId = await getUserIdFromSession();
        if (!userId) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const { client } = getServerClient();
        const presences = new Presences(client);
        const result = await presences.upsert({
            presenceId,
            userId,
            status: "typing",
            expiresAt:
                expiresAt ?? new Date(Date.now() + 8000).toISOString(),
            metadata: {
                channelId,
                userName: userName || undefined,
            },
            permissions: [
                Permission.read(Role.any()),
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
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/typing
 *
 * Delete a typing presence record.
 */
export async function DELETE(request: Request) {
    try {
        const { presenceId } = (await request.json()) as {
            presenceId?: string;
        };

        if (!presenceId) {
            return NextResponse.json(
                { error: "presenceId is required" },
                { status: 400 },
            );
        }

        const userId = await getUserIdFromSession();
        if (!userId) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const { client } = getServerClient();
        const presences = new Presences(client);
        await presences.delete({ presenceId });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete typing presence", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            {
                error: "Failed to delete typing presence",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
