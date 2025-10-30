import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-core";
import { Query, ID } from "node-appwrite";
import { recordAudit } from "@/lib/appwrite-audit";
import { getServerSession } from "@/lib/auth-server";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;
const SERVERS_COLLECTION_ID = process.env.APPWRITE_SERVERS_COLLECTION_ID!;
const MEMBERSHIPS_COLLECTION_ID = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID!;

// Collection IDs for banned/muted users (create these if they don't exist)
const BANNED_USERS_COLLECTION_ID = process.env.APPWRITE_BANNED_USERS_COLLECTION_ID;
const MUTED_USERS_COLLECTION_ID = process.env.APPWRITE_MUTED_USERS_COLLECTION_ID;

export async function POST(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;
    const body = await request.json();
    const { action, userId, reason } = body;

    if (!action || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: action, userId" },
        { status: 400 }
      );
    }

    const { databases } = getServerClient();

    // Get current user (moderator)
    let moderatorId: string;
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    moderatorId = session.$id;

    // Verify server exists and moderator has permissions
    const server = await databases.getDocument(
      DATABASE_ID,
      SERVERS_COLLECTION_ID,
      serverId
    );

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Check if moderator is owner
    const isOwner = server.ownerId === moderatorId;
    if (!isOwner) {
      // TODO: Check if user has admin/moderator role
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    let result;

    switch (action) {
      case "ban":
        if (BANNED_USERS_COLLECTION_ID) {
          // Add to banned users collection
          result = await databases.createDocument(
            DATABASE_ID,
            BANNED_USERS_COLLECTION_ID,
            ID.unique(),
            {
              serverId,
              userId,
              bannedBy: moderatorId,
              reason: reason || "No reason provided",
              bannedAt: new Date().toISOString(),
            }
          );

          // Remove from server memberships
          try {
            const membership = await databases.listDocuments(
              DATABASE_ID,
              MEMBERSHIPS_COLLECTION_ID,
              [
                Query.equal("serverId", serverId),
                Query.equal("userId", userId),
                Query.limit(1),
              ]
            );

            if (membership.documents.length > 0) {
              await databases.deleteDocument(
                DATABASE_ID,
                MEMBERSHIPS_COLLECTION_ID,
                membership.documents[0].$id
              );
            }
          } catch (error) {
            console.error("Error removing membership:", error);
          }
        } else {
          return NextResponse.json(
            { error: "Banned users collection not configured" },
            { status: 500 }
          );
        }
        break;

      case "mute":
        if (MUTED_USERS_COLLECTION_ID) {
          // Add to muted users collection
          result = await databases.createDocument(
            DATABASE_ID,
            MUTED_USERS_COLLECTION_ID,
            ID.unique(),
            {
              serverId,
              userId,
              mutedBy: moderatorId,
              reason: reason || "No reason provided",
              mutedAt: new Date().toISOString(),
            }
          );
        } else {
          return NextResponse.json(
            { error: "Muted users collection not configured" },
            { status: 500 }
          );
        }
        break;

      case "kick":
        // Remove from server memberships
        const membership = await databases.listDocuments(
          DATABASE_ID,
          MEMBERSHIPS_COLLECTION_ID,
          [
            Query.equal("serverId", serverId),
            Query.equal("userId", userId),
            Query.limit(1),
          ]
        );

        if (membership.documents.length > 0) {
          result = await databases.deleteDocument(
            DATABASE_ID,
            MEMBERSHIPS_COLLECTION_ID,
            membership.documents[0].$id
          );
        } else {
          return NextResponse.json(
            { error: "User is not a member of this server" },
            { status: 404 }
          );
        }
        break;

      case "unban":
        if (BANNED_USERS_COLLECTION_ID) {
          // Remove from banned users collection
          const banned = await databases.listDocuments(
            DATABASE_ID,
            BANNED_USERS_COLLECTION_ID,
            [
              Query.equal("serverId", serverId),
              Query.equal("userId", userId),
              Query.limit(1),
            ]
          );

          if (banned.documents.length > 0) {
            result = await databases.deleteDocument(
              DATABASE_ID,
              BANNED_USERS_COLLECTION_ID,
              banned.documents[0].$id
            );
          }
        }
        break;

      case "unmute":
        if (MUTED_USERS_COLLECTION_ID) {
          // Remove from muted users collection
          const muted = await databases.listDocuments(
            DATABASE_ID,
            MUTED_USERS_COLLECTION_ID,
            [
              Query.equal("serverId", serverId),
              Query.equal("userId", userId),
              Query.limit(1),
            ]
          );

          if (muted.documents.length > 0) {
            result = await databases.deleteDocument(
              DATABASE_ID,
              MUTED_USERS_COLLECTION_ID,
              muted.documents[0].$id
            );
          }
        }
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action. Supported: ban, mute, kick, unban, unmute" },
          { status: 400 }
        );
    }

    // Record audit log
    await recordAudit(
      action,
      userId,
      moderatorId,
      {
        serverId,
        reason,
        details: `User ${action}ned from server`,
      }
    );

    return NextResponse.json({
      success: true,
      action,
      userId,
      result,
    });
  } catch (error) {
    console.error("Error performing moderation action:", error);
    return NextResponse.json(
      { error: "Failed to perform moderation action" },
      { status: 500 }
    );
  }
}
