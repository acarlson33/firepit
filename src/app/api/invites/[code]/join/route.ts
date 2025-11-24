import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { useInvite } from "@/lib/appwrite-invites";
import { logger, recordError } from "@/lib/posthog-utils";

/**
 * POST /api/invites/[code]/join - Join a server via invite code
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const startTime = Date.now();

  try {
    // Authenticate user
    const user = await getServerSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      {
        error: error instanceof Error ? error.message : "Failed to join server",
      },
      { status: 500 }
    );
  }
}
