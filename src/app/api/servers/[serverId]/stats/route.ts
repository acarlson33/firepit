import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-server";
import { Query } from "node-appwrite";
import { logger } from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { apiCache } from "@/lib/cache-utils";

const envConfig = getEnvConfig();
const DATABASE_ID = envConfig.databaseId;
const SERVERS_COLLECTION_ID = envConfig.collections.servers;
const CHANNELS_COLLECTION_ID = envConfig.collections.channels;
const MESSAGES_COLLECTION_ID = envConfig.collections.messages;
const MEMBERSHIPS_COLLECTION_ID = envConfig.collections.memberships;
const BANNED_USERS_COLLECTION_ID = envConfig.collections.bannedUsers;
const MUTED_USERS_COLLECTION_ID = envConfig.collections.mutedUsers;
const SERVER_STATS_CACHE_TTL_MS = 10 * 1000;

function canUseServerStatsCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function dedupeServerStatsCache<T>(
    key: string,
    fetcher: () => Promise<T>,
): Promise<T> {
    if (!canUseServerStatsCache()) {
        return fetcher();
    }

    return apiCache.dedupe(key, fetcher, SERVER_STATS_CACHE_TTL_MS);
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const { serverId } = await params;
        const { databases } = getServerClient();

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const access = await getServerPermissionsForUser(
            databases,
            envConfig,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageServer) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get server info to verify it exists
        const server = await databases.getDocument(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            serverId,
        );

        if (!server) {
            return NextResponse.json(
                { error: "Server not found" },
                { status: 404 },
            );
        }

        // Count recent messages (last 24 hours)
        const oneDayAgo = new Date(
            Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString();
        const [
            membersResult,
            channelsResult,
            messagesResult,
            recentMessagesResult,
            bannedResult,
            mutedResult,
        ] = await dedupeServerStatsCache(
            `api:servers:stats:${serverId}`,
            () =>
                Promise.all([
                    databases.listDocuments(DATABASE_ID, MEMBERSHIPS_COLLECTION_ID, [
                        Query.equal("serverId", serverId),
                        Query.limit(1),
                    ]),
                    databases.listDocuments(DATABASE_ID, CHANNELS_COLLECTION_ID, [
                        Query.equal("serverId", serverId),
                        Query.limit(1),
                    ]),
                    databases.listDocuments(DATABASE_ID, MESSAGES_COLLECTION_ID, [
                        Query.equal("serverId", serverId),
                        Query.limit(1),
                    ]),
                    databases.listDocuments(DATABASE_ID, MESSAGES_COLLECTION_ID, [
                        Query.equal("serverId", serverId),
                        Query.greaterThan("$createdAt", oneDayAgo),
                        Query.limit(1),
                    ]),
                    BANNED_USERS_COLLECTION_ID
                        ? databases.listDocuments(
                              DATABASE_ID,
                              BANNED_USERS_COLLECTION_ID,
                              [Query.equal("serverId", serverId), Query.limit(1)],
                          )
                        : Promise.resolve({ total: 0 }),
                    MUTED_USERS_COLLECTION_ID
                        ? databases.listDocuments(
                              DATABASE_ID,
                              MUTED_USERS_COLLECTION_ID,
                              [Query.equal("serverId", serverId), Query.limit(1)],
                          )
                        : Promise.resolve({ total: 0 }),
                ]),
        );

        const totalMembers = membersResult.total;
        const totalChannels = channelsResult.total;
        const totalMessages = messagesResult.total;
        const recentMessages = recentMessagesResult.total;
        const bannedUsers = bannedResult.total;
        const mutedUsers = mutedResult.total;

        return NextResponse.json(
            {
                totalMembers,
                totalChannels,
                totalMessages,
                recentMessages,
                bannedUsers,
                mutedUsers,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        logger.error("Error fetching server stats", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch server stats" },
            { status: 500 },
        );
    }
}
