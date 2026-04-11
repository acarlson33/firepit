import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";
const roleAssignmentsCollectionId = "role_assignments";
const bannedUsersCollectionId = env.collections.bannedUsers || "banned_users";
const mutedUsersCollectionId = env.collections.mutedUsers || "muted_users";
const QUERY_ARRAY_LIMIT = 100;
const PAGE_SIZE = 100;

function chunkValues<T>(values: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

async function listAllServerDocuments(serverId: string, collectionId: string) {
    const { databases } = getServerClient();
    const documents: Array<Record<string, unknown>> = [];
    let cursorAfter: string | null = null;

    while (true) {
        const queries = [
            Query.equal("serverId", serverId),
            Query.limit(PAGE_SIZE),
        ];

        if (typeof Query.orderAsc === "function") {
            queries.push(Query.orderAsc("$id"));
        }

        if (cursorAfter && typeof Query.cursorAfter === "function") {
            queries.push(Query.cursorAfter(cursorAfter));
        }

        const page = await databases.listDocuments(
            databaseId,
            collectionId,
            queries,
        );
        const pageDocuments = page.documents as Array<Record<string, unknown>>;
        documents.push(...pageDocuments);

        if (pageDocuments.length < PAGE_SIZE) {
            break;
        }

        const lastDocument = pageDocuments.at(-1);
        cursorAfter =
            lastDocument && typeof lastDocument.$id === "string"
                ? lastDocument.$id
                : null;

        if (!cursorAfter) {
            break;
        }
    }

    return documents;
}

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const { serverId } = await context.params;
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
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageRoles) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get all memberships for this server
        const memberships = await listAllServerDocuments(
            serverId,
            membershipsCollectionId,
        );

        const membershipUserIds = memberships.map((membership) =>
            String(membership.userId),
        );

        // Get role assignments for this server
        const roleAssignments = await listAllServerDocuments(
            serverId,
            roleAssignmentsCollectionId,
        );

        // Get banned/muted status for this server
        const memberIdChunks = chunkValues(
            membershipUserIds,
            QUERY_ARRAY_LIMIT,
        );

        const bannedDocuments: Array<Record<string, unknown>> = [];
        const mutedDocuments: Array<Record<string, unknown>> = [];
        for (const userIdChunk of memberIdChunks) {
            const [bannedPage, mutedPage] = await Promise.all([
                databases.listDocuments(databaseId, bannedUsersCollectionId, [
                    Query.equal("serverId", serverId),
                    Query.equal("userId", userIdChunk),
                    Query.limit(userIdChunk.length),
                ]),
                databases.listDocuments(databaseId, mutedUsersCollectionId, [
                    Query.equal("serverId", serverId),
                    Query.equal("userId", userIdChunk),
                    Query.limit(userIdChunk.length),
                ]),
            ]);

            bannedDocuments.push(
                ...(bannedPage.documents as Array<Record<string, unknown>>),
            );
            mutedDocuments.push(
                ...(mutedPage.documents as Array<Record<string, unknown>>),
            );
        }

        // Build fast lookup sets for moderation flags.
        const bannedUserIds = new Set(
            bannedDocuments.map((doc) => String(doc.userId)),
        );
        const mutedUserIds = new Set(
            mutedDocuments.map((doc) => String(doc.userId)),
        );

        // Create a map of userId to roleIds
        const roleMap = new Map<string, string[]>();
        for (const assignment of roleAssignments) {
            roleMap.set(
                assignment.userId as string,
                (assignment.roleIds as string[]) || [],
            );
        }

        const profileDocuments: Array<Record<string, unknown>> = [];
        for (const userIdChunk of memberIdChunks) {
            const profilePage = await databases.listDocuments(
                databaseId,
                profilesCollectionId,
                [
                    Query.equal("userId", userIdChunk),
                    Query.limit(userIdChunk.length),
                ],
            );

            profileDocuments.push(
                ...(profilePage.documents as Array<Record<string, unknown>>),
            );
        }

        const profilesByUserId = new Map(
            profileDocuments.map((profile) => [
                String(profile.userId),
                profile,
            ]),
        );

        const members = [] as Array<{
            userId: string;
            userName?: string;
            displayName?: string;
            avatarUrl?: string;
            roleIds: string[];
            isBanned: boolean;
            isMuted: boolean;
        }>;

        for (const membership of memberships) {
            const userId = membership.userId as string;
            try {
                const profile = profilesByUserId.get(userId);

                if (!profile) {
                    // User profile is gone (likely account deleted) — remove membership and any role assignments
                    const membershipDocumentId = String(membership.$id);
                    await databases.deleteDocument(
                        databaseId,
                        membershipsCollectionId,
                        membershipDocumentId,
                    );

                    const orphanAssignments = await databases.listDocuments(
                        databaseId,
                        roleAssignmentsCollectionId,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userId),
                            Query.limit(100),
                        ],
                    );

                    await Promise.all(
                        orphanAssignments.documents.map((assignment) =>
                            databases.deleteDocument(
                                databaseId,
                                roleAssignmentsCollectionId,
                                String(assignment.$id),
                            ),
                        ),
                    );

                    logger.info(
                        "Removed orphaned membership after user deletion",
                        {
                            serverId,
                            userId,
                        },
                    );
                    continue;
                }

                members.push({
                    userId,
                    userName: profile.userName as string | undefined,
                    displayName: profile.displayName as string | undefined,
                    avatarUrl: profile.avatarUrl as string | undefined,
                    roleIds: roleMap.get(userId) || [],
                    isBanned: bannedUserIds.has(userId),
                    isMuted: mutedUserIds.has(userId),
                });
            } catch (error) {
                logger.error("Failed to enrich membership", {
                    serverId,
                    userId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        return NextResponse.json({ members });
    } catch (error) {
        logger.error("Failed to list server members", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list server members" },
            { status: 500 },
        );
    }
}
