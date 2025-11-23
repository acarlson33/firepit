import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-core";
import { Query } from "node-appwrite";
import { logger } from "@/lib/newrelic-utils";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "";
const AUDIT_COLLECTION_ID = process.env.APPWRITE_AUDIT_COLLECTION_ID ?? "";
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID ?? "";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);

    if (!AUDIT_COLLECTION_ID) {
      return NextResponse.json(
        { error: "Audit logging not configured" },
        { status: 500 }
      );
    }

    const { databases } = getServerClient();

    // Fetch audit logs for this server
    const auditLogs = await databases.listDocuments(
      DATABASE_ID,
      AUDIT_COLLECTION_ID,
      [
        Query.equal("serverId", serverId),
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
      ]
    );

    // Enrich with profile data
    const userIds = new Set<string>();
    for (const log of auditLogs.documents) {
      if (log.userId) {
        userIds.add(log.userId);
      }
      if (log.targetUserId) {
        userIds.add(log.targetUserId);
      }
    }

    const profiles = new Map();
    if (userIds.size > 0 && PROFILES_COLLECTION_ID) {
      const profilesResult = await databases.listDocuments(
        DATABASE_ID,
        PROFILES_COLLECTION_ID,
        [Query.equal("userId", Array.from(userIds))]
      );

      for (const profile of profilesResult.documents) {
        profiles.set(profile.userId, {
          displayName: profile.displayName,
          userName: profile.userName,
          avatarUrl: profile.avatarUrl,
        });
      }
    }

    const enrichedLogs = auditLogs.documents.map((log) => {
      const moderatorProfile = log.userId ? profiles.get(log.userId) : null;
      const targetProfile = log.targetUserId ? profiles.get(log.targetUserId) : null;

      return {
        $id: log.$id,
        action: log.action || log.operation || "unknown",
        moderatorId: log.userId,
        moderatorName: moderatorProfile?.displayName || moderatorProfile?.userName,
        targetUserId: log.targetUserId,
        targetUserName: targetProfile?.displayName || targetProfile?.userName,
        reason: log.reason || log.metadata?.reason,
        timestamp: log.$createdAt,
        details: log.details || log.metadata?.details,
      };
    });

    return NextResponse.json(enrichedLogs);
  } catch (error) {
    logger.error("Error fetching audit logs:", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
