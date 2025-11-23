import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { createInvite, listServerInvites } from "@/lib/appwrite-invites";
import { getServerClient } from "@/lib/appwrite-core";
import { logger, recordError } from "@/lib/newrelic-utils";
import { inviteCreateSchema, validateBody } from "@/lib/validation";

const { databases } = getServerClient();
const env = await import("@/lib/appwrite-core").then((m) => m.getEnvConfig());

/**
 * POST /api/servers/[serverId]/invites - Create a new invite
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate user
    const user = await getServerSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { serverId } = await params;
    const userId = user.$id;

    // Get request body
    const body = await request.json();
    
    // Validate invite creation data
    const validation = validateBody(inviteCreateSchema, {
      serverId,
      channelId: body.channelId,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
      temporary: body.temporary,
    });
    
    if (!validation.success) {
      logger.warn("Invite validation failed", { error: validation.error, issues: validation.issues });
      return NextResponse.json(
        { error: validation.error, issues: validation.issues },
        { status: 400 }
      );
    }
    
    const { channelId, expiresAt, maxUses, temporary } = body;

    // Check if server exists and get owner
    let server;
    try {
      server = await databases.getDocument(
        env.databaseId,
        env.collections.servers,
        serverId
      );
    } catch {
      return NextResponse.json(
        { error: "Server not found" },
        { status: 404 }
      );
    }

    // Check permissions: owner or global admin
    const isOwner = server.ownerId === userId;
    const globalRoles = await getUserRoles(userId);
    const isAdmin = globalRoles.isAdmin;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        {
          error:
            "Insufficient permissions. You must be the server owner or a global admin.",
        },
        { status: 403 }
      );
    }

    // Create the invite
    const invite = await createInvite({
      serverId,
      creatorId: userId,
      channelId,
      expiresAt,
      maxUses,
      temporary,
    });

    logger.info("Invite created", {
      inviteId: invite.$id,
      serverId,
      creatorId: userId,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(invite);
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "POST /api/servers/[serverId]/invites",
        endpoint: "/api/servers/[serverId]/invites",
      }
    );

    logger.error("Failed to create invite", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create invite",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/servers/[serverId]/invites - List all invites for a server
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate user
    const user = await getServerSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { serverId } = await params;
    const userId = user.$id;

    // Check if server exists and get owner
    let server;
    try {
      server = await databases.getDocument(
        env.databaseId,
        env.collections.servers,
        serverId
      );
    } catch {
      return NextResponse.json(
        { error: "Server not found" },
        { status: 404 }
      );
    }

    // Check permissions: owner or global admin
    const isOwner = server.ownerId === userId;
    const globalRoles = await getUserRoles(userId);
    const isAdmin = globalRoles.isAdmin;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        {
          error:
            "Insufficient permissions. You must be the server owner or a global admin.",
        },
        { status: 403 }
      );
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
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "GET /api/servers/[serverId]/invites",
        endpoint: "/api/servers/[serverId]/invites",
      }
    );

    logger.error("Failed to list invites", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list invites",
      },
      { status: 500 }
    );
  }
}
