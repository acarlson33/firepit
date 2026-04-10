import { ID, Query } from "node-appwrite";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { logger } from "@/lib/newrelic-utils";
import type { ServerInvite, InviteUsage } from "./types";
import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-server";
import { assignDefaultRoleServer } from "./default-role";
import { getActualMemberCount } from "./membership-count";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const INVITES_COLLECTION_ID = "invites";
const INVITE_USAGE_COLLECTION_ID = "invite_usage";
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || "memberships";
const SERVERS_COLLECTION_ID = env.collections.servers;
export const ROLE_MEMBER = "member";

export type CreateInviteOptions = {
    serverId: string;
    creatorId: string;
    channelId?: string;
    expiresAt?: string; // ISO timestamp
    maxUses?: number | null; // null/undefined for unlimited
    temporary?: boolean;
};

export type ValidationResult = {
    valid: boolean;
    error?: string;
    invite?: ServerInvite;
};

type ReconcileInviteUsageResult = {
    scanned: number;
    removed: number;
    flagged: number;
};

function isConflictError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { code?: number; message?: string };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

function createInviteUsageSlotDocumentId(
    inviteId: string,
    useIndex: number,
): string {
    const digest = createHash("sha256")
        .update(`${inviteId}:${String(useIndex)}`)
        .digest("hex")
        .slice(0, 28);

    return `invuse_${digest}`;
}

/**
 * Reconcile orphaned invite usage documents that do not map to an existing membership.
 * This routine is idempotent and safe to run periodically.
 */
export async function reconcileOrphanedInviteUsageSlots(options?: {
    limit?: number;
}): Promise<ReconcileInviteUsageResult> {
    const { databases } = getServerClient();
    const hardLimit = options?.limit && options.limit > 0 ? options.limit : 250;
    const pageSize = Math.min(hardLimit, 100);

    let scanned = 0;
    let removed = 0;
    let flagged = 0;
    let cursorAfter: string | null = null;

    while (scanned < hardLimit) {
        const queries = [Query.orderAsc("$createdAt"), Query.limit(pageSize)];
        if (cursorAfter) {
            queries.push(Query.cursorAfter(cursorAfter));
        }

        const usagePage = await databases.listDocuments(
            DATABASE_ID,
            INVITE_USAGE_COLLECTION_ID,
            queries,
        );

        if (usagePage.documents.length === 0) {
            break;
        }

        const remaining = hardLimit - scanned;
        const usageBatch = usagePage.documents.slice(0, remaining);
        scanned += usageBatch.length;

        const validUsageEntries: Array<{
            usageId: string;
            userId: string;
            serverId: string;
        }> = [];
        const userIdsByServerId = new Map<string, Set<string>>();

        for (const usageDocument of usageBatch) {
            const userId = (usageDocument as Record<string, unknown>).userId;
            const serverId = (usageDocument as Record<string, unknown>)
                .serverId;

            if (typeof userId !== "string" || typeof serverId !== "string") {
                flagged += 1;
                logger.error(
                    "Invalid invite usage document shape during reconciliation",
                    {
                        usageId: usageDocument.$id,
                        userId,
                        serverId,
                    },
                );
                continue;
            }

            validUsageEntries.push({
                usageId: String(usageDocument.$id),
                userId,
                serverId,
            });

            const serverUserIds = userIdsByServerId.get(serverId) ?? new Set();
            serverUserIds.add(userId);
            userIdsByServerId.set(serverId, serverUserIds);
        }

        const existingMembershipKeys = new Set<string>();
        const membershipFetchTasks: Promise<void>[] = [];

        for (const [serverId, userIdsSet] of userIdsByServerId) {
            const userIds = [...userIdsSet];

            for (let index = 0; index < userIds.length; index += 100) {
                const userIdChunk = userIds.slice(index, index + 100);
                const task = databases
                    .listDocuments(
                        DATABASE_ID,
                        MEMBERSHIPS_COLLECTION_ID,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userIdChunk),
                            Query.limit(100),
                        ],
                    )
                    .then((membershipPage) => {
                        for (const membershipDocument of membershipPage.documents) {
                            const membershipRecord =
                                membershipDocument as Record<string, unknown>;
                            const membershipUserId = membershipRecord.userId;
                            const membershipServerId = membershipRecord.serverId;

                            if (
                                typeof membershipUserId === "string" &&
                                typeof membershipServerId === "string"
                            ) {
                                existingMembershipKeys.add(
                                    `${membershipServerId}:${membershipUserId}`,
                                );
                            }
                        }
                    })
                    .catch((error) => {
                        logger.error(
                            "Failed to query memberships during invite usage reconciliation",
                            {
                                serverId,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            },
                        );
                    });

                membershipFetchTasks.push(task);
            }
        }

        await Promise.all(membershipFetchTasks);

        const orphanUsageIds = validUsageEntries
            .filter(
                (entry) =>
                    !existingMembershipKeys.has(`${entry.serverId}:${entry.userId}`),
            )
            .map((entry) => entry.usageId);

        const deleteResults = await Promise.allSettled(
            orphanUsageIds.map((usageId) =>
                databases.deleteDocument(
                    DATABASE_ID,
                    INVITE_USAGE_COLLECTION_ID,
                    usageId,
                ),
            ),
        );

        for (const [index, result] of deleteResults.entries()) {
            if (result.status === "fulfilled") {
                removed += 1;
                continue;
            }

            flagged += 1;
            logger.error("Failed to delete orphaned invite usage document", {
                usageId: orphanUsageIds[index],
                error:
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
            });
        }

        const lastDocument = usagePage.documents.at(-1);
        cursorAfter = lastDocument ? String(lastDocument.$id) : null;
        if (usagePage.documents.length < pageSize || !cursorAfter) {
            break;
        }
    }

    return {
        scanned,
        removed,
        flagged,
    };
}

/**
 * Generate a unique invite code with collision retry logic
 * @returns {Promise<string>} The return value.
 */
async function generateUniqueCode(): Promise<string> {
    const maxAttempts = 5;
    const { databases } = getServerClient();

    for (let i = 0; i < maxAttempts; i++) {
        const code = nanoid(10);

        try {
            // Check if code exists
            const existing = await databases.listDocuments(
                DATABASE_ID,
                INVITES_COLLECTION_ID,
                [Query.equal("code", code), Query.limit(1)],
            );

            if (existing.documents.length === 0) {
                return code;
            }
        } catch (error) {
            // Continue to next attempt if query fails
            logger.error("Code uniqueness check failed:", { error });
        }
    }

    throw new Error(
        "Failed to generate unique invite code after multiple attempts",
    );
}

/**
 * Create a new server invite
 *
 * @param {{ serverId: string; creatorId: string; channelId?: string | undefined; expiresAt?: string | undefined; maxUses?: number | undefined; temporary?: boolean | undefined; }} options - The options value.
 * @returns {Promise<ServerInvite>} The return value.
 */
export async function createInvite(
    options: CreateInviteOptions,
): Promise<ServerInvite> {
    const { databases } = getServerClient();
    const code = await generateUniqueCode();

    const data = {
        serverId: options.serverId,
        code,
        creatorId: options.creatorId,
        channelId: options.channelId || null,
        expiresAt: options.expiresAt || null,
        maxUses: options.maxUses ?? null,
        currentUses: 0,
        temporary: options.temporary ?? false,
    };

    const result = await databases.createDocument(
        DATABASE_ID,
        INVITES_COLLECTION_ID,
        ID.unique(),
        data,
    );

    return result as unknown as ServerInvite;
}

/**
 * Get invite by code
 *
 * @param {string} code - The code value.
 * @returns {Promise<ServerInvite | null>} The return value.
 */
export async function getInviteByCode(
    code: string,
): Promise<ServerInvite | null> {
    const { databases } = getServerClient();

    try {
        const result = await databases.listDocuments(
            DATABASE_ID,
            INVITES_COLLECTION_ID,
            [Query.equal("code", code), Query.limit(1)],
        );

        if (result.documents.length === 0) {
            return null;
        }

        return result.documents[0] as unknown as ServerInvite;
    } catch (error) {
        logger.error("Failed to get invite by code:", { error });
        return null;
    }
}

/**
 * Validate an invite code
 *
 * @param {string} code - The code value.
 * @returns {Promise<ValidationResult>} The return value.
 */
export async function validateInvite(code: string): Promise<ValidationResult> {
    const invite = await getInviteByCode(code);

    if (!invite) {
        return { valid: false, error: "Invalid invite code" };
    }

    // Check expiration
    if (invite.expiresAt) {
        const expirationDate = new Date(invite.expiresAt);
        if (expirationDate < new Date()) {
            return { valid: false, error: "Invite has expired", invite };
        }
    }

    // Check max uses
    if (typeof invite.maxUses === "number" && Number.isFinite(invite.maxUses)) {
        if (invite.currentUses >= invite.maxUses) {
            return {
                valid: false,
                error: "Invite has reached maximum uses",
                invite,
            };
        }
    }

    return { valid: true, invite };
}

/**
 * Use an invite (increment usage count and record usage)
 *
 * @param {string} code - The code value.
 * @param {string} userId - The user id value.
 * @returns {Promise<{ success: boolean; error?: string | undefined; serverId?: string | undefined; }>} The return value.
 */
export async function useInvite(
    code: string,
    userId: string,
): Promise<{ success: boolean; error?: string; serverId?: string }> {
    const { databases } = getServerClient();

    // Validate the invite
    const validation = await validateInvite(code);
    if (!validation.valid || !validation.invite) {
        return { success: false, error: validation.error };
    }

    const invite = validation.invite;
    const joinedAt = new Date().toISOString();
    const usagePayload = {
        inviteCode: code,
        userId,
        serverId: invite.serverId,
        joinedAt,
    };
    let reservedUsageId: string | undefined;
    let reservedUseIndex: number | undefined;
    let enforceMaxUsesReservation = typeof invite.maxUses === "number";

    // Check if user is already a member
    try {
        const existingMembership = await databases.listDocuments(
            DATABASE_ID,
            MEMBERSHIPS_COLLECTION_ID,
            [
                Query.equal("userId", userId),
                Query.equal("serverId", invite.serverId),
                Query.limit(1),
            ],
        );

        if (existingMembership.documents.length > 0) {
            return {
                success: false,
                error: "You are already a member of this server",
            };
        }
    } catch (error) {
        logger.error("Failed to check existing membership:", { error });
        return { success: false, error: "Failed to verify membership status" };
    }

    if (enforceMaxUsesReservation) {
        let snapshot = invite;
        const maxReservationAttempts = 5;
        let highestAttemptedIndex = snapshot.currentUses;

        for (let attempt = 0; attempt < maxReservationAttempts; attempt++) {
            if (snapshot.maxUses === null) {
                // Invite was switched to unlimited while we were reserving slots.
                enforceMaxUsesReservation = false;
                break;
            }

            if (typeof snapshot.maxUses !== "number") {
                return {
                    success: false,
                    error: "Invite is no longer available",
                };
            }

            if (snapshot.currentUses >= snapshot.maxUses) {
                return {
                    success: false,
                    error: "Invite has reached maximum uses",
                };
            }

            const nextUseIndex = Math.max(
                snapshot.currentUses + 1,
                highestAttemptedIndex + 1,
            );

            if (nextUseIndex > snapshot.maxUses) {
                return {
                    success: false,
                    error: "Invite has reached maximum uses",
                };
            }

            const usageDocId = createInviteUsageSlotDocumentId(
                snapshot.$id,
                nextUseIndex,
            );

            try {
                await databases.createDocument(
                    DATABASE_ID,
                    INVITE_USAGE_COLLECTION_ID,
                    usageDocId,
                    usagePayload,
                );
                reservedUsageId = usageDocId;
                reservedUseIndex = nextUseIndex;
                break;
            } catch (error) {
                if (!isConflictError(error)) {
                    logger.error("Failed to reserve invite usage slot:", {
                        error,
                    });
                    return {
                        success: false,
                        error: "Failed to join server",
                    };
                }

                highestAttemptedIndex = nextUseIndex;

                const refreshedInvite = await getInviteByCode(code);
                if (!refreshedInvite) {
                    return {
                        success: false,
                        error: "Invite is no longer available",
                    };
                }

                snapshot = refreshedInvite;
            }
        }

        if (enforceMaxUsesReservation && !reservedUsageId) {
            return {
                success: false,
                error: "Invite is currently being used. Please try again.",
            };
        }
    }

    // Create membership
    try {
        await databases.createDocument(
            DATABASE_ID,
            MEMBERSHIPS_COLLECTION_ID,
            ID.unique(),
            {
                serverId: invite.serverId,
                userId,
                role: ROLE_MEMBER,
            },
        );
    } catch (error) {
        if (reservedUsageId) {
            try {
                await databases.deleteDocument(
                    DATABASE_ID,
                    INVITE_USAGE_COLLECTION_ID,
                    reservedUsageId,
                );
            } catch (rollbackError) {
                logger.error("Failed to rollback reserved invite usage slot", {
                    reservedUsageId,
                    inviteId: invite.$id,
                    serverId: invite.serverId,
                    userId,
                    error:
                        rollbackError instanceof Error
                            ? rollbackError.message
                            : String(rollbackError),
                });

                const reconciliationTask = reconcileOrphanedInviteUsageSlots({
                    limit: 250,
                });
                reconciliationTask.catch((reconcileError) => {
                    logger.error("Invite usage reconciliation failed", {
                        inviteId: invite.$id,
                        reservedUsageId,
                        error:
                            reconcileError instanceof Error
                                ? reconcileError.message
                                : String(reconcileError),
                    });
                });
            }
        }

        if (isConflictError(error)) {
            return {
                success: false,
                error: "You are already a member of this server",
            };
        }

        logger.error("Failed to create membership:", { error });
        return { success: false, error: "Failed to join server" };
    }

    try {
        await assignDefaultRoleServer(invite.serverId, userId);
    } catch (error) {
        logger.warn("Failed to assign default role after invite join", {
            serverId: invite.serverId,
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        // Non-fatal; proceed even if default role assignment fails
    }

    if (!reservedUsageId) {
        // Unlimited invites keep historical behavior: record usage after successful join.
        try {
            await databases.createDocument(
                DATABASE_ID,
                INVITE_USAGE_COLLECTION_ID,
                ID.unique(),
                usagePayload,
            );
        } catch (error) {
            logger.error("Failed to record invite usage:", { error });
            // Non-fatal - membership was created successfully
        }
    }

    // For limited invites, slot reservation gives us a monotonic use index.
    // Unlimited invites skip read-modify-write updates; usage is tracked via invite_usage and can be reconciled periodically.
    if (reservedUseIndex !== undefined) {
        try {
            const latestInvite = await getInviteByCode(code);
            const latestCurrentUses =
                typeof latestInvite?.currentUses === "number"
                    ? latestInvite.currentUses
                    : invite.currentUses;

            if (latestCurrentUses < reservedUseIndex) {
                await databases.updateDocument(
                    DATABASE_ID,
                    INVITES_COLLECTION_ID,
                    invite.$id,
                    {
                        currentUses: reservedUseIndex,
                    },
                );
            }
        } catch (error) {
            logger.error("Failed to update invite usage count:", { error });
            // Non-fatal - membership was created successfully
        }
    }

    return { success: true, serverId: invite.serverId };
}

/**
 * List all invites for a server
 *
 * @param {string} serverId - The server id value.
 * @returns {Promise<ServerInvite[]>} The return value.
 */
export async function listServerInvites(
    serverId: string,
): Promise<ServerInvite[]> {
    const { databases } = getServerClient();

    try {
        const result = await databases.listDocuments(
            DATABASE_ID,
            INVITES_COLLECTION_ID,
            [
                Query.equal("serverId", serverId),
                Query.orderDesc("$createdAt"),
                Query.limit(100),
            ],
        );

        return result.documents as unknown as ServerInvite[];
    } catch (error) {
        logger.error("Failed to list server invites:", { error });
        return [];
    }
}

/**
 * Revoke (delete) an invite
 *
 * @param {string} inviteId - The invite id value.
 * @returns {Promise<boolean>} The return value.
 */
export async function revokeInvite(inviteId: string): Promise<boolean> {
    const { databases } = getServerClient();

    try {
        await databases.deleteDocument(
            DATABASE_ID,
            INVITES_COLLECTION_ID,
            inviteId,
        );
        return true;
    } catch (error) {
        logger.error("Failed to revoke invite:", { error });
        return false;
    }
}

/**
 * Get invite usage statistics for an invite
 *
 * @param {string} code - The code value.
 * @returns {Promise<InviteUsage[]>} The return value.
 */
export async function getInviteUsage(code: string): Promise<InviteUsage[]> {
    const { databases } = getServerClient();

    try {
        const result = await databases.listDocuments(
            DATABASE_ID,
            INVITE_USAGE_COLLECTION_ID,
            [
                Query.equal("inviteCode", code),
                Query.orderDesc("joinedAt"),
                Query.limit(100),
            ],
        );

        return result.documents as unknown as InviteUsage[];
    } catch (error) {
        logger.error("Failed to get invite usage:", { error });
        return [];
    }
}

/**
 * Get server info for invite preview (public, no auth required)
 *
 * @param {string} serverId - The server id value.
 * @returns {Promise<{ name: string; memberCount: number; } | null>} The return value.
 */
export async function getServerPreview(serverId: string): Promise<{
    name: string;
    memberCount: number;
} | null> {
    const { databases } = getServerClient();

    try {
        const server = await databases.getDocument(
            DATABASE_ID,
            SERVERS_COLLECTION_ID,
            serverId,
        );

        // Get actual member count from memberships (single source of truth)
        const actualCount = await getActualMemberCount(databases, serverId);

        return {
            name: server.name as string,
            memberCount: actualCount,
        };
    } catch (error) {
        logger.error("Failed to get server preview:", { error });
        return null;
    }
}
