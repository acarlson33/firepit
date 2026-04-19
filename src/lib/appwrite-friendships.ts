import { ID, Permission, Query, Role } from "node-appwrite";

import { getAdminClient } from "./appwrite-admin";
import { getEnvConfig } from "./appwrite-core";
import { getOrCreateNotificationSettings } from "./notification-settings";
import type { BlockedUser, Friendship, RelationshipStatus } from "./types";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const FRIENDSHIPS_COLLECTION_ID = env.collections.friendships;
const BLOCKS_COLLECTION_ID = env.collections.blocks;

export class RelationshipError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "RelationshipError";
        this.status = status;
    }
}

/**
 * Returns error message.
 *
 * @param {unknown} error - The error value.
 * @returns {string} The return value.
 */
function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

/**
 * Determines whether is relationship schema error.
 *
 * @param {unknown} error - The error value.
 * @returns {boolean} The return value.
 */
function isRelationshipSchemaError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();

    return (
        message.includes("attribute not found in schema") ||
        message.includes("attribute not available") ||
        message.includes("requested attribute") ||
        message.includes(
            "collection with the requested id could not be found",
        ) ||
        message.includes("collection not found")
    );
}

/**
 * Creates relationship schema unavailable error.
 * @returns {RelationshipError} The return value.
 */
function createRelationshipSchemaUnavailableError() {
    return new RelationshipError(
        "Friend system schema is not available yet. Run bun run setup to provision the Appwrite collections.",
        503,
    );
}

async function readRelationshipData<T>(
    operation: () => Promise<T>,
    fallback: T,
) {
    try {
        return await operation();
    } catch (error) {
        if (isRelationshipSchemaError(error)) {
            return fallback;
        }

        throw error;
    }
}

async function writeRelationshipData<T>(operation: () => Promise<T>) {
    try {
        return await operation();
    } catch (error) {
        if (isRelationshipSchemaError(error)) {
            throw createRelationshipSchemaUnavailableError();
        }

        throw error;
    }
}

/**
 * Handles friendship permissions.
 *
 * @param {string} requesterId - The requester id value.
 * @param {string} recipientId - The recipient id value.
 * @returns {string[]} The return value.
 */
function friendshipPermissions(requesterId: string, recipientId: string) {
    return [
        Permission.read(Role.user(requesterId)),
        Permission.read(Role.user(recipientId)),
        Permission.update(Role.user(requesterId)),
        Permission.update(Role.user(recipientId)),
        Permission.delete(Role.user(requesterId)),
        Permission.delete(Role.user(recipientId)),
    ];
}

/**
 * Handles block permissions.
 *
 * @param {string} userId - The user id value.
 * @returns {string[]} The return value.
 */
function blockPermissions(userId: string) {
    return [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
    ];
}

/**
 * Handles to friendship.
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {{ $id: string; requesterId: string; recipientId: string; pairKey: string; status: 'pending' | 'accepted' | 'declined'; requestedAt: string; respondedAt?: string | undefined; acceptedAt?: string | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} The return value.
 */
function toFriendship(doc: Record<string, unknown>): Friendship {
    return {
        $id: String(doc.$id),
        requesterId: String(doc.requesterId),
        recipientId: String(doc.recipientId),
        pairKey: String(doc.pairKey),
        status: doc.status as Friendship["status"],
        requestedAt: String(doc.requestedAt),
        respondedAt: doc.respondedAt ? String(doc.respondedAt) : undefined,
        acceptedAt: doc.acceptedAt ? String(doc.acceptedAt) : undefined,
        $createdAt: doc.$createdAt ? String(doc.$createdAt) : undefined,
        $updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
    };
}

/**
 * Handles to blocked user.
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {{ $id: string; userId: string; blockedUserId: string; blockedAt: string; reason?: string | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} The return value.
 */
function toBlockedUser(doc: Record<string, unknown>): BlockedUser {
    return {
        $id: String(doc.$id),
        userId: String(doc.userId),
        blockedUserId: String(doc.blockedUserId),
        blockedAt: String(doc.blockedAt),
        reason: doc.reason ? String(doc.reason) : undefined,
        $createdAt: doc.$createdAt ? String(doc.$createdAt) : undefined,
        $updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
    };
}

type RelationshipDocumentList = {
    documents: Array<Record<string, unknown>>;
};

/**
 * Normalizes user pair.
 *
 * @param {string} userId - The user id value.
 * @param {string} otherUserId - The other user id value.
 * @returns {{ firstUserId: string; secondUserId: string; pairKey: string; }} The return value.
 */
function normalizeUserPair(userId: string, otherUserId: string) {
    const [firstUserId, secondUserId] = [userId, otherUserId].sort();
    return {
        firstUserId,
        secondUserId,
        pairKey: `${firstUserId}:${secondUserId}`,
    };
}

/**
 * Returns friendship other user id.
 *
 * @param {{ $id: string; requesterId: string; recipientId: string; pairKey: string; status: 'pending' | 'accepted' | 'declined'; requestedAt: string; respondedAt?: string | undefined; acceptedAt?: string | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} friendship - The friendship value.
 * @param {string} userId - The user id value.
 * @returns {string} The return value.
 */
export function getFriendshipOtherUserId(
    friendship: Friendship,
    userId: string,
) {
    if (friendship.requesterId === userId) {
        return friendship.recipientId;
    }
    return friendship.requesterId;
}

/**
 * Handles assert distinct users.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @param {string} action - The action value.
 * @returns {void} The return value.
 */
function assertDistinctUsers(
    userId: string,
    targetUserId: string,
    action: string,
) {
    if (!userId || !targetUserId) {
        throw new RelationshipError("Both users are required", 400);
    }

    if (userId === targetUserId) {
        throw new RelationshipError(`You cannot ${action} yourself`, 400);
    }
}

/**
 * Returns friendship by pair.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @returns {Promise<Friendship | null>} The return value.
 */
async function getFriendshipByPair(
    userId: string,
    targetUserId: string,
) {
    const { databases } = getAdminClient();
    const { pairKey } = normalizeUserPair(userId, targetUserId);
    const response = await readRelationshipData<RelationshipDocumentList>(
        () =>
            databases.listDocuments(DATABASE_ID, FRIENDSHIPS_COLLECTION_ID, [
                Query.equal("pairKey", pairKey),
                Query.limit(1),
            ]) as Promise<RelationshipDocumentList>,
        { documents: [] },
    );

    const document = response.documents[0] as
        | Record<string, unknown>
        | undefined;
    return document ? toFriendship(document) : null;
}

/**
 * Returns block record.
 *
 * @param {string} userId - The user id value.
 * @param {string} blockedUserId - The blocked user id value.
 * @returns {Promise<BlockedUser | null>} The return value.
 */
async function getBlockRecord(userId: string, blockedUserId: string) {
    const { databases } = getAdminClient();
    const response = await readRelationshipData<RelationshipDocumentList>(
        () =>
            databases.listDocuments(DATABASE_ID, BLOCKS_COLLECTION_ID, [
                Query.equal("userId", userId),
                Query.equal("blockedUserId", blockedUserId),
                Query.limit(1),
            ]) as Promise<RelationshipDocumentList>,
        { documents: [] },
    );

    const document = response.documents[0] as
        | Record<string, unknown>
        | undefined;
    return document ? toBlockedUser(document) : null;
}

/**
 * Returns block status.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @returns {Promise<{ blockedByMe: BlockedUser | null; blockedMe: BlockedUser | null; isBlocked: boolean; }>} The return value.
 */
async function getBlockStatus(userId: string, targetUserId: string) {
    const [blockedByMe, blockedMe] = await Promise.all([
        getBlockRecord(userId, targetUserId),
        getBlockRecord(targetUserId, userId),
    ]);

    return {
        blockedByMe,
        blockedMe,
        isBlocked: Boolean(blockedByMe || blockedMe),
    };
}

/**
 * Returns relationship status.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @returns {Promise<RelationshipStatus>} The return value.
 */
export async function getRelationshipStatus(
    userId: string,
    targetUserId: string,
): Promise<RelationshipStatus> {
    assertDistinctUsers(userId, targetUserId, "check a relationship with");

    const [friendship, blockStatus, notificationSettings] = await Promise.all([
        getFriendshipByPair(userId, targetUserId),
        getBlockStatus(userId, targetUserId),
        getOrCreateNotificationSettings(targetUserId),
    ]);

    const isFriend = friendship?.status === "accepted";
    const outgoingRequest =
        friendship?.status === "pending" && friendship.requesterId === userId;
    const incomingRequest =
        friendship?.status === "pending" && friendship.recipientId === userId;
    const directMessagePrivacy = notificationSettings.directMessagePrivacy;
    const canSendDirectMessage =
        !blockStatus.blockedByMe &&
        !blockStatus.blockedMe &&
        (directMessagePrivacy === "everyone" || isFriend);

    return {
        userId: targetUserId,
        friendshipStatus: friendship?.status,
        isFriend,
        outgoingRequest,
        incomingRequest,
        blockedByMe: Boolean(blockStatus.blockedByMe),
        blockedMe: Boolean(blockStatus.blockedMe),
        directMessagePrivacy,
        canSendDirectMessage,
        canReceiveFriendRequest:
            !isFriend &&
            !outgoingRequest &&
            !incomingRequest &&
            !blockStatus.blockedByMe &&
            !blockStatus.blockedMe,
    };
}

/**
 * Lists friendships for user.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<{ friends: Friendship[]; incoming: Friendship[]; outgoing: Friendship[]; }>} The return value.
 */
export async function listFriendshipsForUser(userId: string) {
    const { databases } = getAdminClient();
    const [requested, received] = await Promise.all([
        readRelationshipData<RelationshipDocumentList>(
            () =>
                databases.listDocuments(
                    DATABASE_ID,
                    FRIENDSHIPS_COLLECTION_ID,
                    [
                        Query.equal("requesterId", userId),
                        Query.limit(200),
                        Query.orderDesc("requestedAt"),
                    ],
                ) as Promise<RelationshipDocumentList>,
            { documents: [] },
        ),
        readRelationshipData<RelationshipDocumentList>(
            () =>
                databases.listDocuments(
                    DATABASE_ID,
                    FRIENDSHIPS_COLLECTION_ID,
                    [
                        Query.equal("recipientId", userId),
                        Query.limit(200),
                        Query.orderDesc("requestedAt"),
                    ],
                ) as Promise<RelationshipDocumentList>,
            { documents: [] },
        ),
    ]);

    const friendships = [...requested.documents, ...received.documents].map(
        (doc) => toFriendship(doc as unknown as Record<string, unknown>),
    );

    const friends = friendships.filter(
        (friendship) => friendship.status === "accepted",
    );
    const incoming = friendships.filter(
        (friendship) =>
            friendship.status === "pending" &&
            friendship.recipientId === userId,
    );
    const outgoing = friendships.filter(
        (friendship) =>
            friendship.status === "pending" &&
            friendship.requesterId === userId,
    );

    return { friends, incoming, outgoing };
}

/**
 * Lists blocked users.
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<BlockedUser[]>} The return value.
 */
export async function listBlockedUsers(userId: string) {
    const { databases } = getAdminClient();
    const response = await readRelationshipData<RelationshipDocumentList>(
        () =>
            databases.listDocuments(DATABASE_ID, BLOCKS_COLLECTION_ID, [
                Query.equal("userId", userId),
                Query.limit(200),
                Query.orderDesc("blockedAt"),
            ]) as Promise<RelationshipDocumentList>,
        { documents: [] },
    );

    return response.documents.map((doc) =>
        toBlockedUser(doc as unknown as Record<string, unknown>),
    );
}

/**
 * Removes friendship by id.
 *
 * @param {string} friendshipId - The friendship id value.
 * @returns {Promise<void>} The return value.
 */
async function deleteFriendshipById(friendshipId: string) {
    const { databases } = getAdminClient();
    await writeRelationshipData(() =>
        databases.deleteDocument(
            DATABASE_ID,
            FRIENDSHIPS_COLLECTION_ID,
            friendshipId,
        ),
    );
}

/**
 * Creates friend request.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @returns {Promise<Friendship>} The return value.
 */
export async function createFriendRequest(
    userId: string,
    targetUserId: string,
) {
    assertDistinctUsers(userId, targetUserId, "friend");

    const [existingFriendship, blockStatus] = await Promise.all([
        getFriendshipByPair(userId, targetUserId),
        getBlockStatus(userId, targetUserId),
    ]);

    if (blockStatus.blockedByMe) {
        throw new RelationshipError(
            "Unblock this user before sending a friend request",
            409,
        );
    }

    if (blockStatus.blockedMe) {
        throw new RelationshipError(
            "You cannot send a friend request to this user",
            403,
        );
    }

    const { databases } = getAdminClient();
    const now = new Date().toISOString();
    const { pairKey } = normalizeUserPair(userId, targetUserId);

    if (existingFriendship) {
        if (existingFriendship.status === "accepted") {
            throw new RelationshipError("You are already friends", 409);
        }

        if (existingFriendship.status === "pending") {
            if (existingFriendship.requesterId === userId) {
                throw new RelationshipError(
                    "Friend request already pending",
                    409,
                );
            }

            const updated = await writeRelationshipData(() =>
                databases.updateDocument(
                    DATABASE_ID,
                    FRIENDSHIPS_COLLECTION_ID,
                    existingFriendship.$id,
                    {
                        status: "accepted",
                        respondedAt: now,
                        acceptedAt: now,
                    },
                ),
            );

            return toFriendship(updated as unknown as Record<string, unknown>);
        }

        const updated = await writeRelationshipData(() =>
            databases.updateDocument(
                DATABASE_ID,
                FRIENDSHIPS_COLLECTION_ID,
                existingFriendship.$id,
                {
                    requesterId: userId,
                    recipientId: targetUserId,
                    status: "pending",
                    requestedAt: now,
                    respondedAt: null,
                    acceptedAt: null,
                },
            ),
        );

        return toFriendship(updated as unknown as Record<string, unknown>);
    }

    const friendship = await writeRelationshipData(() =>
        databases.createDocument(
            DATABASE_ID,
            FRIENDSHIPS_COLLECTION_ID,
            ID.unique(),
            {
                requesterId: userId,
                recipientId: targetUserId,
                pairKey,
                status: "pending",
                requestedAt: now,
            },
            friendshipPermissions(userId, targetUserId),
        ),
    );

    return toFriendship(friendship as unknown as Record<string, unknown>);
}

/**
 * Handles respond to friend request.
 *
 * @param {string} userId - The user id value.
 * @param {string} requesterId - The requester id value.
 * @param {'accept' | 'decline'} action - The action value.
 * @returns {Promise<Friendship>} The return value.
 */
export async function respondToFriendRequest(
    userId: string,
    requesterId: string,
    action: "accept" | "decline",
) {
    assertDistinctUsers(userId, requesterId, `${action} a friend request from`);

    const friendship = await getFriendshipByPair(userId, requesterId);
    if (!friendship || friendship.status !== "pending") {
        throw new RelationshipError("Friend request not found", 404);
    }

    if (
        friendship.requesterId !== requesterId ||
        friendship.recipientId !== userId
    ) {
        throw new RelationshipError(
            "Only the recipient can respond to this friend request",
            403,
        );
    }

    const now = new Date().toISOString();
    const { databases } = getAdminClient();
    const updated = await writeRelationshipData(() =>
        databases.updateDocument(
            DATABASE_ID,
            FRIENDSHIPS_COLLECTION_ID,
            friendship.$id,
            {
                status: action === "accept" ? "accepted" : "declined",
                respondedAt: now,
                acceptedAt: action === "accept" ? now : null,
            },
        ),
    );

    return toFriendship(updated as unknown as Record<string, unknown>);
}

/**
 * Removes friendship.
 *
 * @param {string} userId - The user id value.
 * @param {string} targetUserId - The target user id value.
 * @returns {Promise<Friendship>} The return value.
 */
export async function removeFriendship(userId: string, targetUserId: string) {
    assertDistinctUsers(userId, targetUserId, "remove");

    const friendship = await getFriendshipByPair(userId, targetUserId);
    if (!friendship) {
        throw new RelationshipError("Friendship not found", 404);
    }

    await deleteFriendshipById(friendship.$id);
    return friendship;
}

/**
 * Handles block user.
 *
 * @param {string} userId - The user id value.
 * @param {string} blockedUserId - The blocked user id value.
 * @param {string | undefined} reason - The reason value, if provided.
 * @returns {Promise<BlockedUser>} The return value.
 */
export async function blockUser(
    userId: string,
    blockedUserId: string,
    reason?: string,
) {
    assertDistinctUsers(userId, blockedUserId, "block");

    const existingBlock = await getBlockRecord(userId, blockedUserId);
    if (existingBlock) {
        return existingBlock;
    }

    const friendship = await getFriendshipByPair(userId, blockedUserId);
    if (friendship) {
        await deleteFriendshipById(friendship.$id);
    }

    const { databases } = getAdminClient();
    const block = await writeRelationshipData(() =>
        databases.createDocument(
            DATABASE_ID,
            BLOCKS_COLLECTION_ID,
            ID.unique(),
            {
                userId,
                blockedUserId,
                blockedAt: new Date().toISOString(),
                reason: reason?.trim() ? reason.trim() : null,
            },
            blockPermissions(userId),
        ),
    );

    return toBlockedUser(block as unknown as Record<string, unknown>);
}

/**
 * Handles unblock user.
 *
 * @param {string} userId - The user id value.
 * @param {string} blockedUserId - The blocked user id value.
 * @returns {Promise<BlockedUser>} The return value.
 */
export async function unblockUser(userId: string, blockedUserId: string) {
    assertDistinctUsers(userId, blockedUserId, "unblock");

    const existingBlock = await getBlockRecord(userId, blockedUserId);
    if (!existingBlock) {
        throw new RelationshipError("Block not found", 404);
    }

    const { databases } = getAdminClient();
    await writeRelationshipData(() =>
        databases.deleteDocument(
            DATABASE_ID,
            BLOCKS_COLLECTION_ID,
            existingBlock.$id,
        ),
    );
    return existingBlock;
}

/**
 * Returns relationship map.
 *
 * @param {string} userId - The user id value.
 * @param {string[]} otherUserIds - The other user ids value.
 * @returns {Promise<Map<string, RelationshipStatus>>} The return value.
 */
export async function getRelationshipMap(
    userId: string,
    otherUserIds: string[],
) {
    const uniqueUserIds = Array.from(new Set(otherUserIds)).filter(
        (otherUserId) => otherUserId && otherUserId !== userId,
    );

    const entries = await Promise.all(
        uniqueUserIds.map(
            async (otherUserId) =>
                [
                    otherUserId,
                    await getRelationshipStatus(userId, otherUserId),
                ] as const,
        ),
    );

    return new Map(entries);
}

/**
 * Handles filter visible user ids.
 *
 * @param {string} userId - The user id value.
 * @param {string[]} otherUserIds - The other user ids value.
 * @returns {Promise<string[]>} The return value.
 */
async function filterVisibleUserIds(
    userId: string,
    otherUserIds: string[],
) {
    const relationshipMap = await getRelationshipMap(userId, otherUserIds);

    return otherUserIds.filter((otherUserId) => {
        if (!otherUserId || otherUserId === userId) {
            return false;
        }

        const relationship = relationshipMap.get(otherUserId);
        return !relationship?.blockedByMe && !relationship?.blockedMe;
    });
}
