import { NextResponse } from "next/server";

import { createServer } from "@/lib/appwrite-servers";
import { getServerSession } from "@/lib/auth-server";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";
import { getPostHogClient } from "@/lib/posthog-server";
import { normalizeServerFileId } from "@/lib/server-metadata";

const MAX_SERVER_NAME_LENGTH = 100;
const MAX_SERVER_DESCRIPTION_LENGTH = 500;

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

        let payload: {
            name?: string;
            description?: string;
            iconFileId?: string;
            bannerFileId?: string;
            isPublic?: boolean;
        };
        try {
            payload = (await request.json()) as {
                name?: string;
                description?: string;
                iconFileId?: string;
                bannerFileId?: string;
                isPublic?: boolean;
            };
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON payload" },
                { status: 400 },
            );
        }

        const { name, description, iconFileId, bannerFileId, isPublic } =
            payload;

        if (!name?.trim()) {
            return NextResponse.json(
                { success: false, error: "Server name is required" },
                { status: 400 },
            );
        }

        if (name.trim().length > MAX_SERVER_NAME_LENGTH) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Server name must be ${MAX_SERVER_NAME_LENGTH} characters or fewer`,
                },
                { status: 400 },
            );
        }

        const normalizedDescription =
            typeof description === "string" ? description.trim() : undefined;
        if (
            normalizedDescription &&
            normalizedDescription.length > MAX_SERVER_DESCRIPTION_LENGTH
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Description must be ${MAX_SERVER_DESCRIPTION_LENGTH} characters or fewer`,
                },
                { status: 400 },
            );
        }

        if (isPublic !== undefined && typeof isPublic !== "boolean") {
            return NextResponse.json(
                {
                    success: false,
                    error: "isPublic must be a boolean value",
                },
                { status: 400 },
            );
        }

        const normalizedIconFileId =
            iconFileId === undefined
                ? undefined
                : normalizeServerFileId(iconFileId);
        if (iconFileId !== undefined && !normalizedIconFileId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "iconFileId must be a valid Appwrite file ID",
                },
                { status: 400 },
            );
        }

        const normalizedBannerFileId =
            bannerFileId === undefined
                ? undefined
                : normalizeServerFileId(bannerFileId);
        if (bannerFileId !== undefined && !normalizedBannerFileId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "bannerFileId must be a valid Appwrite file ID",
                },
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
            description: normalizedDescription,
            iconFileId: normalizedIconFileId,
            bannerFileId: normalizedBannerFileId,
            isPublic,
            bypassFeatureCheck: true,
        });

        const telemetryTask = getPostHogClient().capture({
            distinctId: session.$id,
            event: "server_created",
            properties: { serverId: server.$id },
        });

        void Promise.resolve(telemetryTask).catch((telemetryError) => {
            logger.warn("Telemetry capture failed", {
                event: "server_created",
                userId: session.$id,
                serverId: server.$id,
                error:
                    telemetryError instanceof Error
                        ? telemetryError.message
                        : String(telemetryError),
            });
        });

        return NextResponse.json({
            success: true,
            server: {
                $id: server.$id,
                $createdAt: server.$createdAt,
                name: server.name,
                ownerId: server.ownerId,
                memberCount: server.memberCount,
                description: server.description,
                iconFileId: server.iconFileId,
                iconUrl: server.iconUrl,
                bannerFileId: server.bannerFileId,
                bannerUrl: server.bannerUrl,
                isPublic: server.isPublic,
                defaultOnSignup: server.defaultOnSignup,
            },
        }, { status: 200 });
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
