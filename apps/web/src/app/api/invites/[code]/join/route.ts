import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { useInvite } from "@/lib/appwrite-invites";
import { logger, recordError,
    returnUnauthorized,
    getPostHogClient,
} from "@/lib/newrelic-utils";
import { invalidateChannelsUserCaches } from "@/lib/channels-route-cache";

/**
 * POST /api/invites/[code]/join - Join a server via invite code
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate user
    const user = await getServerSession();
    if (!user) {
      return returnUnauthorized();
    }

    const { code } = await params;
    const userId = user.$id;

    // Use the invite (validates, creates membership, tracks usage)
    const result = await useInvite(code, userId);

    if (!result.success) {
      logger.warn("Failed to use invite", {
        code,
        userId,
        error: result.error,
        duration: Date.now() - startTime,
      });

      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    logger.info("User joined server via invite", {
      code,
      userId,
      serverId: result.serverId,
      duration: Date.now() - startTime,
    });

    if (typeof result.serverId === "string" && result.serverId.length > 0) {
      invalidateChannelsUserCaches({
        serverId: result.serverId,
        userId,
      });
    }

    try {
      getPostHogClient().capture({
        distinctId: userId,
        event: "server_joined_via_invite",
        properties: { serverId: result.serverId },
      });
    } catch (analyticsError) {
      logger.warn("Failed to capture invite join analytics", {
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : String(analyticsError),
      });
    }

    return NextResponse.json({
      success: true,
      serverId: result.serverId,
    });
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "POST /api/invites/[code]/join",
        endpoint: "/api/invites/[code]/join",
      }
    );

    logger.error("Failed to join via invite", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: "Failed to join server" },
      { status: 500 }
    );
  }
}
