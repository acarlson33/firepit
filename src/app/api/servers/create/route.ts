import { NextResponse } from "next/server";

import { createServer } from "@/lib/appwrite-servers";
import { getServerSession } from "@/lib/auth-server";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(request: Request) {
    try {
        // Get authenticated user
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 },
            );
        }

        let payload: { name?: string };
        try {
            payload = (await request.json()) as { name?: string };
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON payload" },
                { status: 400 },
            );
        }

        const { name } = payload;

        if (!name?.trim()) {
            return NextResponse.json(
                { success: false, error: "Server name is required" },
                { status: 400 },
            );
        }

        const allowUserServers = await getFeatureFlag(
            FEATURE_FLAGS.ALLOW_USER_SERVERS,
        );
        if (!allowUserServers) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Server creation is currently disabled. Contact an administrator.",
                },
                { status: 403 },
            );
        }

        const server = await createServer(name.trim(), {
            bypassFeatureCheck: true,
        });

        try {
            getPostHogClient().capture({
                distinctId: session.$id,
                event: "server_created",
                properties: { serverId: server.$id },
            });
        } catch (telemetryError) {
            logger.warn("Telemetry capture failed", {
                event: "server_created",
                userId: session.$id,
                serverId: server.$id,
                error:
                    telemetryError instanceof Error
                        ? telemetryError.message
                        : String(telemetryError),
            });
        }

        return NextResponse.json({
            success: true,
            server: {
                $id: server.$id,
                name: server.name,
                ownerId: server.ownerId,
                memberCount: server.memberCount,
            },
        });
    } catch (error) {
        logger.error("Server creation error", {
            error: error instanceof Error ? error.message : String(error),
        });

        // Return user-friendly error message
        const message =
            error instanceof Error ? error.message : "Failed to create server";

        return NextResponse.json(
            { success: false, error: message },
            { status: 500 },
        );
    }
}
