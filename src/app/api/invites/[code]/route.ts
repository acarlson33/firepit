import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import {
    getInviteByCode,
    revokeInvite,
    getServerPreview,
} from "@/lib/appwrite-invites";
import { getServerClient } from "@/lib/appwrite-server";
import { logger, recordError } from "@/lib/newrelic-utils";

const { databases } = getServerClient();
const env = await import("@/lib/appwrite-core").then((m) => m.getEnvConfig());

/**
 * GET /api/invites/[code] - Get invite preview (public endpoint)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ code: string }> },
) {
    const startTime = Date.now();

    try {
        const { code } = await params;

        // Get the invite
        const invite = await getInviteByCode(code);
        if (!invite) {
            return NextResponse.json(
                { error: "Invite not found" },
                { status: 404 },
            );
        }

        // Get server preview (public info)
        const serverPreview = await getServerPreview(invite.serverId);
        if (!serverPreview) {
            return NextResponse.json(
                { error: "Server not found" },
                { status: 404 },
            );
        }

        // Return invite + server preview
        const response = {
            invite: {
                code: invite.code,
                serverId: invite.serverId,
                channelId: invite.channelId,
                expiresAt: invite.expiresAt,
                maxUses: invite.maxUses,
                currentUses: invite.currentUses,
                temporary: invite.temporary,
            },
            server: serverPreview,
        };

        logger.info("Invite preview fetched", {
            code,
            serverId: invite.serverId,
            duration: Date.now() - startTime,
        });

        return NextResponse.json(response);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "GET /api/invites/[code]",
            endpoint: "/api/invites/[code]",
        });

        logger.error("Failed to get invite preview", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to get invite",
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/invites/[code] - Revoke an invite
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ code: string }> },
) {
    const startTime = Date.now();

    try {
        // Authenticate user
        const user = await getServerSession();
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { code } = await params;
        const userId = user.$id;

        // Get the invite
        const invite = await getInviteByCode(code);
        if (!invite) {
            return NextResponse.json(
                { error: "Invite not found" },
                { status: 404 },
            );
        }

        // Check if server exists and get owner
        let server;
        try {
            server = await databases.getDocument(
                env.databaseId,
                env.collections.servers,
                invite.serverId,
            );
        } catch {
            return NextResponse.json(
                { error: "Server not found" },
                { status: 404 },
            );
        }

        // Check permissions: owner, creator, or global admin
        const isOwner = server.ownerId === userId;
        const isCreator = invite.creatorId === userId;
        const globalRoles = await getUserRoles(userId);
        const isAdmin = globalRoles.isAdmin;

        if (!isOwner && !isCreator && !isAdmin) {
            return NextResponse.json(
                {
                    error: "Insufficient permissions. You must be the server owner, invite creator, or a global admin.",
                },
                { status: 403 },
            );
        }

        // Revoke the invite
        const success = await revokeInvite(invite.$id);
        if (!success) {
            return NextResponse.json(
                { error: "Failed to revoke invite" },
                { status: 500 },
            );
        }

        logger.info("Invite revoked", {
            inviteId: invite.$id,
            code,
            serverId: invite.serverId,
            revokedBy: userId,
            duration: Date.now() - startTime,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "DELETE /api/invites/[code]",
            endpoint: "/api/invites/[code]",
        });

        logger.error("Failed to revoke invite", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to revoke invite",
            },
            { status: 500 },
        );
    }
}
