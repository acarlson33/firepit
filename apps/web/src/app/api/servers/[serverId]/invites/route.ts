import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { createInvite, listServerInvites } from "@/lib/appwrite-invites";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { logger, recordError,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";

const { databases } = getServerClient();
const env = getEnvConfig();

function hasInvitePermission(access: {
    isServerOwner: boolean;
    permissions: { administrator: boolean; manageServer: boolean };
}): boolean {
    return (
        access.isServerOwner ||
        access.permissions.administrator ||
        access.permissions.manageServer
    );
}

function validateBody(body: unknown): {
    channelId: unknown;
    expiresAt: unknown;
    maxUses: unknown;
    temporary: unknown;
} | null {
    if (typeof body !== "object" || body === null) {
        return null;
    }
    const { channelId, expiresAt, maxUses, temporary } = body as Record<
        string,
        unknown
    >;

    if (channelId !== null && channelId !== undefined && typeof channelId !== "string") {
        return null;
    }
    if (expiresAt !== null && expiresAt !== undefined) {
        if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) {
            return null;
        }
        if (new Date(expiresAt).getTime() <= Date.now()) {
            return null;
        }
    }
    if (maxUses !== null && maxUses !== undefined) {
        if (
            typeof maxUses !== "number" ||
            !Number.isInteger(maxUses) ||
            maxUses <= 0
        ) {
            return null;
        }
    }
    if (temporary !== null && temporary !== undefined && typeof temporary !== "boolean") {
        return null;
    }

    return { channelId, expiresAt, maxUses, temporary };
}

/**
 * POST /api/servers/[serverId]/invites - Create a new invite
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    const startTime = Date.now();

    try {
        // Authenticate user
        const user = await getServerSession();
        if (!user?.$id) {
            return returnUnauthorized();
        }

        const { serverId } = await params;
        const userId = user.$id;

        // Get request body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON payload" },
                { status: 400 },
            );
        }
        const fields = validateBody(body);
        if (!fields) {
            return NextResponse.json(
                { error: "Invalid invite fields" },
                { status: 400 },
            );
        }

        // Check server-level permissions: owner, administrator, or manageServer
        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            userId,
        );
        if (!hasInvitePermission(access)) {
            return returnForbidden();
        }

        // Create the invite
        const invite = await createInvite({
            serverId,
            creatorId: userId,
            channelId: fields.channelId as string | undefined,
            expiresAt: fields.expiresAt as string | undefined,
            maxUses: fields.maxUses as number | null | undefined,
            temporary: fields.temporary as boolean | undefined,
        });

        logger.info("Invite created", {
            inviteId: invite.$id,
            serverId,
            creatorId: userId,
            duration: Date.now() - startTime,
        });

        return NextResponse.json(invite);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "POST /api/servers/[serverId]/invites",
            endpoint: "/api/servers/[serverId]/invites",
        });

        logger.error("Failed to create invite", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return NextResponse.json(
            { error: "Failed to create invite" },
            { status: 500 },
        );
    }
}

/**
 * GET /api/servers/[serverId]/invites - List all invites for a server
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    const startTime = Date.now();

    try {
        // Authenticate user
        const user = await getServerSession();
        if (!user?.$id) {
            return returnUnauthorized();
        }

        const { serverId } = await params;
        const userId = user.$id;

        // Check server-level permissions: owner, administrator, or manageServer
        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            userId,
        );
        if (!hasInvitePermission(access)) {
            return returnForbidden();
        }

        // List invites
        const invites = await listServerInvites(serverId);

        logger.info("Invites listed", {
            serverId,
            count: invites.length,
            duration: Date.now() - startTime,
        });

        return NextResponse.json(invites);
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "GET /api/servers/[serverId]/invites",
            endpoint: "/api/servers/[serverId]/invites",
        });

        logger.error("Failed to list invites", {
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
        });

        return NextResponse.json(
            { error: "Failed to list invites" },
            { status: 500 },
        );
    }
}
