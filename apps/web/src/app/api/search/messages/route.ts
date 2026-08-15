import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { EnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import {
    getChannelAccessForUser,
    getServerPermissionsForUser,
} from "@/lib/server-channel-access";
import { getRelationshipMap } from "@/lib/appwrite-friendships";
import type { Message, DirectMessage } from "@/lib/types";
import { getAvatarUrl, resolveProfileUserId } from "@/lib/appwrite-profiles";
import {
    logger,
    recordError,
    setTransactionName,
    trackApiCall,
} from "@/lib/newrelic-utils";

type SearchResult = {
    type: "channel" | "dm";
    message: Message | DirectMessage;
};

function getOtherIdFromDirectMessage(
    directMessage: DirectMessage,
    currentUserId: string,
) {
    if (directMessage.senderId === currentUserId) {
        return typeof directMessage.receiverId === "string" &&
            directMessage.receiverId.length > 0
            ? directMessage.receiverId
            : undefined;
    }

    if (directMessage.receiverId === currentUserId) {
        return typeof directMessage.senderId === "string" &&
            directMessage.senderId.length > 0
            ? directMessage.senderId
            : undefined;
    }

    return undefined;
}

const MAX_ACCESSIBLE_CHANNELS = 100;

const FROM_FILTER_REGEX = /from:@?([a-zA-Z0-9_-]+)/;
const IN_FILTER_REGEX = /in:#?([a-zA-Z0-9_-]+)/;
const BEFORE_FILTER_REGEX = /before:(\d{4}-\d{2}-\d{2})/;
const AFTER_FILTER_REGEX = /after:(\d{4}-\d{2}-\d{2})/;
const HAS_IMAGE_REGEX = /has:image/g;
const MENTIONS_ME_REGEX = /mentions:me/g;

async function getAccessibleChannelIds(
    databases: Databases,
    env: EnvConfig,
    userId: string,
): Promise<string[]> {
    const membershipResult = await databases.listDocuments(
        env.databaseId,
        env.collections.memberships,
        [Query.equal("userId", userId), Query.limit(1000)],
    );

    const serverIds = Array.from(
        new Set(
            membershipResult.documents
                .map((doc) => String((doc as Record<string, unknown>).serverId))
                .filter(Boolean),
        ),
    );

    const accessibleChannelIds: string[] = [];
    for (const serverId of serverIds) {
        try {
            const serverAccess = await getServerPermissionsForUser(
                databases,
                env,
                serverId,
                userId,
            );
            if (
                !serverAccess.isMember ||
                (!serverAccess.isServerOwner &&
                    !serverAccess.permissions.administrator &&
                    !serverAccess.permissions.readMessages)
            ) {
                continue;
            }

            const channelsResult = await databases.listDocuments(
                env.databaseId,
                env.collections.channels,
                [Query.equal("serverId", serverId), Query.limit(1000)],
            );

            for (const channelDoc of channelsResult.documents) {
                const channelId = String(
                    (channelDoc as Record<string, unknown>).$id,
                );
                if (!channelId) {
                    continue;
                }

                const channelAccess = await getChannelAccessForUser(
                    databases,
                    env,
                    channelId,
                    userId,
                );
                if (channelAccess.canRead) {
                    accessibleChannelIds.push(channelId);
                    // ponytail: caps the channel-message constraint at 100
                    // channels (Appwrite Query.equal array limit). If users can
                    // read more, OR across paginated equality queries.
                    if (
                        accessibleChannelIds.length >= MAX_ACCESSIBLE_CHANNELS
                    ) {
                        return accessibleChannelIds;
                    }
                }
            }
        } catch {
            // Skip servers whose metadata failed to resolve (e.g. deleted servers).
        }
    }

    return accessibleChannelIds;
}

/**
 * Parse search filters from query string
 * Supports: from:@username, in:#channel, has:image, mentions:me, before:date, after:date
 */
function parseFilters(query: string) {
    const filters: {
        text: string;
        fromUser?: string;
        inChannel?: string;
        hasImage?: boolean;
        mentionsMe?: boolean;
        beforeDate?: string;
        afterDate?: string;
    } = {
        text: "",
    };

    let remainingText = query;

    // Extract from:@username or from:username
    const fromMatch = remainingText.match(FROM_FILTER_REGEX);
    if (fromMatch) {
        filters.fromUser = fromMatch[1];
        remainingText = remainingText.replace(fromMatch[0], "").trim();
    }

    // Extract in:#channel or in:channel
    const inMatch = remainingText.match(IN_FILTER_REGEX);
    if (inMatch) {
        filters.inChannel = inMatch[1];
        remainingText = remainingText.replace(inMatch[0], "").trim();
    }

    // Extract has:image
    if (remainingText.includes("has:image")) {
        filters.hasImage = true;
        remainingText = remainingText.replace(HAS_IMAGE_REGEX, "").trim();
    }

    // Extract mentions:me
    if (remainingText.includes("mentions:me")) {
        filters.mentionsMe = true;
        remainingText = remainingText.replace(MENTIONS_ME_REGEX, "").trim();
    }

    // Extract before:YYYY-MM-DD
    const beforeMatch = remainingText.match(BEFORE_FILTER_REGEX);
    if (beforeMatch) {
        filters.beforeDate = beforeMatch[1];
        remainingText = remainingText.replace(beforeMatch[0], "").trim();
    }

    // Extract after:YYYY-MM-DD
    const afterMatch = remainingText.match(AFTER_FILTER_REGEX);
    if (afterMatch) {
        filters.afterDate = afterMatch[1];
        remainingText = remainingText.replace(afterMatch[0], "").trim();
    }

    filters.text = remainingText.trim();

    return filters;
}

/**
 * GET /api/search/messages
 * Search messages across channels and DMs with filters
 */
export async function GET(request: NextRequest) {
    const startTime = Date.now();

    try {
        setTransactionName("GET /api/search/messages");

        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            logger.warn("Unauthenticated search attempt");
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q");
        const channelId = searchParams.get("channel");
        const userId = searchParams.get("user");
        const fromDate = searchParams.get("from");
        const toDate = searchParams.get("to");

        if (!query || query.trim().length < 2) {
            return NextResponse.json(
                { error: "Search query must be at least 2 characters" },
                { status: 400 },
            );
        }

        const env = getEnvConfig();
        const { databases } = getServerClient();

        // Parse filters from query
        const filters = parseFilters(query);

        // `from:` filters by username; resolve it to a userId before querying.
        let fromUserId: string | undefined;
        if (filters.fromUser) {
            fromUserId = await resolveProfileUserId(filters.fromUser);
            if (!fromUserId) {
                return NextResponse.json(
                    { error: `Unknown user: ${filters.fromUser}` },
                    { status: 400 },
                );
            }
        }

        const results: SearchResult[] = [];

        const requestedChannelId = channelId || filters.inChannel || null;

        // Verify the caller can read a specific requested channel before searching it.
        if (requestedChannelId) {
            const channelAccess = await getChannelAccessForUser(
                databases,
                env,
                requestedChannelId,
                user.$id,
            );
            if (!channelAccess.canRead) {
                return NextResponse.json({ results: [] });
            }
        }

        // Resolve channels the caller can read to constrain the channel search.
        let accessibleChannelIds: string[] = [];
        if (!requestedChannelId) {
            accessibleChannelIds = await getAccessibleChannelIds(
                databases,
                env,
                user.$id,
            );
        }

        // Build query filters for channel messages
        const messageQueries: string[] = [];

        // Add text search if we have remaining text after filter extraction
        if (filters.text) {
            messageQueries.push(Query.search("text", filters.text));
        }

        // Constrain the search to channels the caller can read.
        if (requestedChannelId) {
            messageQueries.push(Query.equal("channelId", requestedChannelId));
        } else if (accessibleChannelIds.length > 0) {
            messageQueries.push(Query.equal("channelId", accessibleChannelIds));
        }

        // Apply user filter
        const filterUserId = userId || fromUserId;
        if (filterUserId) {
            messageQueries.push(Query.equal("userId", filterUserId));
        }

        // Apply date filters
        if (fromDate || filters.afterDate) {
            const dateStr = fromDate || filters.afterDate || "";
            messageQueries.push(Query.greaterThanEqual("$createdAt", dateStr));
        }

        if (toDate || filters.beforeDate) {
            const dateStr = toDate || filters.beforeDate || "";
            messageQueries.push(Query.lessThanEqual("$createdAt", dateStr));
        }

        // Apply image filter
        if (filters.hasImage) {
            messageQueries.push(Query.isNotNull("imageFileId"));
        }

        // Apply mentions filter
        if (filters.mentionsMe) {
            messageQueries.push(Query.search("mentions", user.$id));
        }

        // Limit results
        messageQueries.push(Query.limit(50));
        messageQueries.push(Query.orderDesc("$createdAt"));

        // Build DM queries eagerly so both searches can run in parallel
        let dmQueries: string[] | null = null;
        if (!channelId && !filters.inChannel) {
            dmQueries = [];

            if (filters.text) {
                dmQueries.push(Query.search("text", filters.text));
            }

            dmQueries.push(
                Query.or([
                    Query.equal("senderId", user.$id),
                    Query.equal("receiverId", user.$id),
                ]),
            );

            if (filterUserId) {
                dmQueries.push(Query.equal("senderId", filterUserId));
            }

            if (fromDate || filters.afterDate) {
                const dateStr = fromDate || filters.afterDate || "";
                dmQueries.push(Query.greaterThanEqual("$createdAt", dateStr));
            }

            if (toDate || filters.beforeDate) {
                const dateStr = toDate || filters.beforeDate || "";
                dmQueries.push(Query.lessThanEqual("$createdAt", dateStr));
            }

            if (filters.hasImage) {
                dmQueries.push(Query.isNotNull("imageFileId"));
            }

            if (filters.mentionsMe) {
                dmQueries.push(Query.search("mentions", user.$id));
            }

            dmQueries.push(Query.limit(50));
            dmQueries.push(Query.orderDesc("$createdAt"));
        }

        const canSearchChannels =
            requestedChannelId !== null || accessibleChannelIds.length > 0;

        // Run channel and DM searches in parallel
        const [channelResult, dmResult] = await Promise.all([
            canSearchChannels
                ? databases.listDocuments(
                      env.databaseId,
                      env.collections.messages,
                      messageQueries,
                  ).catch((error) => {
                      logger.error("Failed to search channel messages", {
                          error:
                              error instanceof Error
                                  ? error.message
                                  : String(error),
                      });
                      return null;
                  })
                : Promise.resolve(null),
            dmQueries
                ? databases.listDocuments(
                      env.databaseId,
                      env.collections.directMessages,
                      dmQueries,
                  ).catch((error) => {
                      logger.error("Failed to search direct messages", {
                          error:
                              error instanceof Error ? error.message : String(error),
                      });
                      return null;
                  })
                : Promise.resolve(null),
        ]);

        const searchElapsedMs = Date.now() - startTime;

        if (channelResult) {
            trackApiCall(
                "/api/search/messages",
                "GET",
                200,
                searchElapsedMs,
                { operation: "listDocuments", collection: "messages" },
            );

            for (const doc of channelResult.documents) {
                const message: Message = {
                    $id: String(doc.$id),
                    userId: String(doc.userId),
                    userName: doc.userName ? String(doc.userName) : undefined,
                    text: String(doc.text),
                    $createdAt: String(doc.$createdAt ?? ""),
                    channelId: doc.channelId
                        ? String(doc.channelId)
                        : undefined,
                    serverId: doc.serverId ? String(doc.serverId) : undefined,
                    editedAt: doc.editedAt ? String(doc.editedAt) : undefined,
                    removedAt: doc.removedAt
                        ? String(doc.removedAt)
                        : undefined,
                    removedBy: doc.removedBy
                        ? String(doc.removedBy)
                        : undefined,
                    imageFileId: doc.imageFileId
                        ? String(doc.imageFileId)
                        : undefined,
                    imageUrl: doc.imageUrl ? String(doc.imageUrl) : undefined,
                    replyToId: doc.replyToId
                        ? String(doc.replyToId)
                        : undefined,
                    mentions: Array.isArray(doc.mentions)
                        ? (doc.mentions as string[])
                        : undefined,
                    reactions: Array.isArray(doc.reactions)
                        ? (doc.reactions as Array<{
                              emoji: string;
                              userIds: string[];
                              count: number;
                          }>)
                        : undefined,
                };

                results.push({ type: "channel", message });
            }
        }

        if (dmResult) {
            trackApiCall(
                "/api/search/messages",
                "GET",
                200,
                searchElapsedMs,
                {
                    operation: "listDocuments",
                    collection: "directMessages",
                },
            );

            for (const doc of dmResult.documents) {
                const message: DirectMessage = {
                    $id: String(doc.$id),
                    conversationId: String(doc.conversationId),
                    senderId: String(doc.senderId),
                    receiverId: String(doc.receiverId),
                    text: String(doc.text),
                    $createdAt: String(doc.$createdAt ?? ""),
                    editedAt: doc.editedAt
                        ? String(doc.editedAt)
                        : undefined,
                    removedAt: doc.removedAt
                        ? String(doc.removedAt)
                        : undefined,
                    removedBy: doc.removedBy
                        ? String(doc.removedBy)
                        : undefined,
                    imageFileId: doc.imageFileId
                        ? String(doc.imageFileId)
                        : undefined,
                    imageUrl: doc.imageUrl
                        ? String(doc.imageUrl)
                        : undefined,
                    replyToId: doc.replyToId
                        ? String(doc.replyToId)
                        : undefined,
                    mentions: Array.isArray(doc.mentions)
                        ? (doc.mentions as string[])
                        : undefined,
                    reactions: Array.isArray(doc.reactions)
                        ? (doc.reactions as Array<{
                              emoji: string;
                              userIds: string[];
                              count: number;
                          }>)
                        : undefined,
                };

                results.push({ type: "dm", message });
            }
        }

        // Sort all results by date (most recent first)
        const relationshipSubjects = new Set<string>();
        const dmCounterpartyMap = new Map<string, string | undefined>();
        for (const result of results) {
            if (result.type === "channel") {
                relationshipSubjects.add((result.message as Message).userId);
                continue;
            }

            const directMessage = result.message as DirectMessage;
            const otherId = getOtherIdFromDirectMessage(
                directMessage,
                user.$id,
            );
            dmCounterpartyMap.set(directMessage.$id, otherId);
            if (otherId) {
                relationshipSubjects.add(otherId);
            }
        }

        const relationshipSubjectsList = Array.from(relationshipSubjects);
        const relationshipMap = await getRelationshipMap(
            user.$id,
            relationshipSubjectsList,
        );
        const visibleResults = results.filter((result) => {
            if (result.type === "channel") {
                const relationship = relationshipMap.get(
                    (result.message as Message).userId,
                );
                return !relationship?.blockedByMe && !relationship?.blockedMe;
            }

            const directMessage = result.message as DirectMessage;
            const otherId = dmCounterpartyMap.get(directMessage.$id);
            if (!otherId) {
                logger.warn(
                    "Dropping malformed direct message search result with missing counterparty",
                    {
                        directMessageId: directMessage.$id,
                        userId: user.$id,
                    },
                );
                return false;
            }

            const relationship = relationshipMap.get(otherId);
            return !relationship?.blockedByMe && !relationship?.blockedMe;
        });

        // Sort all results by date (most recent first)
        visibleResults.sort((a, b) => {
            const rawDateA = new Date(a.message.$createdAt).getTime();
            const rawDateB = new Date(b.message.$createdAt).getTime();
            const dateA = Number.isFinite(rawDateA) ? rawDateA : 0;
            const dateB = Number.isFinite(rawDateB) ? rawDateB : 0;
            return dateB - dateA;
        });

        // Limit to 50 results total
        const limitedResults = visibleResults.slice(0, 50);

        // Enrich results with profile data
        const userIds = new Set<string>();
        for (const result of limitedResults) {
            if (result.type === "channel") {
                const message = result.message as Message;
                userIds.add(message.userId);
            } else {
                const dm = result.message as DirectMessage;
                userIds.add(dm.senderId);
            }
        }

        // Fetch profiles for all users
        const profileMap = new Map<
            string,
            { displayName?: string; avatarUrl?: string; pronouns?: string }
        >();
        try {
            const profileIds = Array.from(userIds);
            if (profileIds.length > 0) {
                const profiles = await databases.listDocuments(
                    env.databaseId,
                    env.collections.profiles,
                    [Query.equal("userId", profileIds), Query.limit(100)],
                );

                for (const profile of profiles.documents) {
                    profileMap.set(String(profile.userId), {
                        displayName: profile.displayName
                            ? String(profile.displayName)
                            : undefined,
                        avatarUrl: profile.avatarFileId
                            ? getAvatarUrl(String(profile.avatarFileId))
                            : undefined,
                        pronouns: profile.pronouns
                            ? String(profile.pronouns)
                            : undefined,
                    });
                }
            }
        } catch (error) {
            logger.error("Failed to fetch profiles for search results", {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // Enrich messages with profile data
        for (const result of limitedResults) {
            if (result.type === "channel") {
                const message = result.message as Message;
                const profile = profileMap.get(message.userId);
                if (profile) {
                    message.displayName = profile.displayName;
                    message.avatarUrl = profile.avatarUrl;
                    message.pronouns = profile.pronouns;
                }
            } else {
                const dm = result.message as DirectMessage;
                const profile = profileMap.get(dm.senderId);
                if (profile) {
                    dm.senderDisplayName = profile.displayName;
                    dm.senderAvatarUrl = profile.avatarUrl;
                    dm.senderPronouns = profile.pronouns;
                }
            }
        }

        logger.info("Message search completed", {
            userId: user.$id,
            queryLength: query.length,
            filterCount: Object.keys(filters).length - 1,
            resultCount: limitedResults.length,
            duration: Date.now() - startTime,
        });

        return NextResponse.json({ results: limitedResults });
    } catch (error) {
        recordError(error instanceof Error ? error : new Error(String(error)), {
            context: "GET /api/search/messages",
            endpoint: "/api/search/messages",
        });

        logger.error("Failed to search messages", {
            error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            { error: "Failed to search messages" },
            { status: 500 },
        );
    }
}
