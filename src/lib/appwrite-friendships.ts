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

function blockPermissions(userId: string) {
    return [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
    ];
}

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

export function normalizeUserPair(userId: string, otherUserId: string) {
    const [firstUserId, secondUserId] = [userId, otherUserId].sort();
    return {
        firstUserId,
        secondUserId,
        pairKey: `${firstUserId}:${secondUserId}`,
    };
}

export function getFriendshipOtherUserId(
    friendship: Friendship,
    userId: string,
) {
    if (friendship.requesterId === userId) {
        return friendship.recipientId;
    }
    return friendship.requesterId;
}

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

export async function getFriendshipByPair(
    userId: string,
    targetUserId: string,
) {
    const { databases } = getAdminClient();
    const { pairKey } = normalizeUserPair(userId, targetUserId);
    const response = await databases.listDocuments(
        DATABASE_ID,
        FRIENDSHIPS_COLLECTION_ID,
        [Query.equal("pairKey", pairKey), Query.limit(1)],
    );

    const document = response.documents[0] as
        | Record<string, unknown>
        | undefined;
    return document ? toFriendship(document) : null;
}

export async function getBlockRecord(userId: string, blockedUserId: string) {
    const { databases } = getAdminClient();
    const response = await databases.listDocuments(
        DATABASE_ID,
        BLOCKS_COLLECTION_ID,
        [
            Query.equal("userId", userId),
            Query.equal("blockedUserId", blockedUserId),
            Query.limit(1),
        ],
    );

    const document = response.documents[0] as
        | Record<string, unknown>
        | undefined;
    return document ? toBlockedUser(document) : null;
}

export async function getBlockStatus(userId: string, targetUserId: string) {
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

export async function listFriendshipsForUser(userId: string) {
    const { databases } = getAdminClient();
    const [requested, received] = await Promise.all([
        databases.listDocuments(DATABASE_ID, FRIENDSHIPS_COLLECTION_ID, [
            Query.equal("requesterId", userId),
            Query.limit(200),
            Query.orderDesc("requestedAt"),
        ]),
        databases.listDocuments(DATABASE_ID, FRIENDSHIPS_COLLECTION_ID, [
            Query.equal("recipientId", userId),
            Query.limit(200),
            Query.orderDesc("requestedAt"),
        ]),
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

export async function listBlockedUsers(userId: string) {
    const { databases } = getAdminClient();
    const response = await databases.listDocuments(
        DATABASE_ID,
        BLOCKS_COLLECTION_ID,
        [
            Query.equal("userId", userId),
            Query.limit(200),
            Query.orderDesc("blockedAt"),
        ],
    );

    return response.documents.map((doc) =>
        toBlockedUser(doc as unknown as Record<string, unknown>),
    );
}

async function deleteFriendshipById(friendshipId: string) {
    const { databases } = getAdminClient();
    await databases.deleteDocument(
        DATABASE_ID,
        FRIENDSHIPS_COLLECTION_ID,
        friendshipId,
    );
}

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

            const updated = await databases.updateDocument(
                DATABASE_ID,
                FRIENDSHIPS_COLLECTION_ID,
                existingFriendship.$id,
                {
                    status: "accepted",
                    respondedAt: now,
                    acceptedAt: now,
                },
            );

            return toFriendship(updated as unknown as Record<string, unknown>);
        }

        const updated = await databases.updateDocument(
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
        );

        return toFriendship(updated as unknown as Record<string, unknown>);
    }

    const friendship = await databases.createDocument(
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
    );

    return toFriendship(friendship as unknown as Record<string, unknown>);
}

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
    const updated = await databases.updateDocument(
        DATABASE_ID,
        FRIENDSHIPS_COLLECTION_ID,
        friendship.$id,
        {
            status: action === "accept" ? "accepted" : "declined",
            respondedAt: now,
            acceptedAt: action === "accept" ? now : null,
        },
    );

    return toFriendship(updated as unknown as Record<string, unknown>);
}

export async function removeFriendship(userId: string, targetUserId: string) {
    assertDistinctUsers(userId, targetUserId, "remove");

    const friendship = await getFriendshipByPair(userId, targetUserId);
    if (!friendship) {
        throw new RelationshipError("Friendship not found", 404);
    }

    await deleteFriendshipById(friendship.$id);
    return friendship;
}

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
    const block = await databases.createDocument(
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
    );

    return toBlockedUser(block as unknown as Record<string, unknown>);
}

export async function unblockUser(userId: string, blockedUserId: string) {
    assertDistinctUsers(userId, blockedUserId, "unblock");

    const existingBlock = await getBlockRecord(userId, blockedUserId);
    if (!existingBlock) {
        throw new RelationshipError("Block not found", 404);
    }

    const { databases } = getAdminClient();
    await databases.deleteDocument(
        DATABASE_ID,
        BLOCKS_COLLECTION_ID,
        existingBlock.$id,
    );
    return existingBlock;
}

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
