import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-core";
import { Query } from "node-appwrite";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;
const SERVERS_COLLECTION_ID = process.env.APPWRITE_SERVERS_COLLECTION_ID!;
const CHANNELS_COLLECTION_ID = process.env.APPWRITE_CHANNELS_COLLECTION_ID!;
const MESSAGES_COLLECTION_ID = process.env.APPWRITE_MESSAGES_COLLECTION_ID!;
const MEMBERSHIPS_COLLECTION_ID = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID!;
const BANNED_USERS_COLLECTION_ID = process.env.APPWRITE_BANNED_USERS_COLLECTION_ID;
const MUTED_USERS_COLLECTION_ID = process.env.APPWRITE_MUTED_USERS_COLLECTION_ID;

export async function GET(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;
    const { databases } = getServerClient();

    // Get server info to verify it exists
    const server = await databases.getDocument(
      DATABASE_ID,
      SERVERS_COLLECTION_ID,
      serverId
    );

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Count members
    const membersResult = await databases.listDocuments(
      DATABASE_ID,
      MEMBERSHIPS_COLLECTION_ID,
      [Query.equal("serverId", serverId), Query.limit(1)]
    );
    const totalMembers = membersResult.total;

    // Count channels
    const channelsResult = await databases.listDocuments(
      DATABASE_ID,
      CHANNELS_COLLECTION_ID,
      [Query.equal("serverId", serverId), Query.limit(1)]
    );
    const totalChannels = channelsResult.total;

    // Count total messages in this server
    const messagesResult = await databases.listDocuments(
      DATABASE_ID,
      MESSAGES_COLLECTION_ID,
      [Query.equal("serverId", serverId), Query.limit(1)]
    );
    const totalMessages = messagesResult.total;

    // Count recent messages (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentMessagesResult = await databases.listDocuments(
      DATABASE_ID,
      MESSAGES_COLLECTION_ID,
      [
        Query.equal("serverId", serverId),
        Query.greaterThan("$createdAt", oneDayAgo),
        Query.limit(1),
      ]
    );
    const recentMessages = recentMessagesResult.total;

    // Count banned users
    let bannedUsers = 0;
    if (BANNED_USERS_COLLECTION_ID) {
      const bannedResult = await databases.listDocuments(
        DATABASE_ID,
        BANNED_USERS_COLLECTION_ID,
        [Query.equal("serverId", serverId), Query.limit(1)]
      );
      bannedUsers = bannedResult.total;
    }

    // Count muted users
    let mutedUsers = 0;
    if (MUTED_USERS_COLLECTION_ID) {
      const mutedResult = await databases.listDocuments(
        DATABASE_ID,
        MUTED_USERS_COLLECTION_ID,
        [Query.equal("serverId", serverId), Query.limit(1)]
      );
      mutedUsers = mutedResult.total;
    }

    return NextResponse.json({
      totalMembers,
      totalChannels,
      totalMessages,
      recentMessages,
      bannedUsers,
      mutedUsers,
    });
  } catch (error) {
    console.error("Error fetching server stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch server stats" },
      { status: 500 }
    );
  }
}
