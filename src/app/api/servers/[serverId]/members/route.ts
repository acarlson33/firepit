import { NextResponse } from "next/server";
import { Client, Databases, Query } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const env = getEnvConfig();
const endpoint = env.endpoint;
const project = env.project;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = env.databaseId || "main";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";
const roleAssignmentsCollectionId = "role_assignments";

if (!endpoint || !project || !apiKey) {
    throw new Error("Missing Appwrite configuration");
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (
    typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
    "function"
) {
    (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
    try {
        const { serverId } = await context.params;

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
        const memberships = await databases.listDocuments(
            databaseId,
            membershipsCollectionId,
            [Query.equal("serverId", serverId), Query.limit(100)],
        );

        // Get role assignments for this server
        const roleAssignments = await databases.listDocuments(
            databaseId,
            roleAssignmentsCollectionId,
            [Query.equal("serverId", serverId), Query.limit(100)],
        );

        // Create a map of userId to roleIds
        const roleMap = new Map<string, string[]>();
        for (const assignment of roleAssignments.documents) {
            roleMap.set(
                assignment.userId as string,
                (assignment.roleIds as string[]) || [],
            );
        }

        const members = [] as Array<{
            userId: string;
            userName?: string;
            displayName?: string;
            avatarUrl?: string;
            roleIds: string[];
        }>;

        for (const membership of memberships.documents) {
            const userId = membership.userId as string;
            try {
                const profiles = await databases.listDocuments(
                    databaseId,
                    profilesCollectionId,
                    [Query.equal("userId", userId), Query.limit(1)],
                );

                const profile = profiles.documents[0];

                if (!profile) {
                    // User profile is gone (likely account deleted) — remove membership and any role assignments
                    await databases.deleteDocument(
                        databaseId,
                        membershipsCollectionId,
                        membership.$id,
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
                                assignment.$id,
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
                    userName: profile.userId as string,
                    displayName: profile.displayName as string | undefined,
                    avatarUrl: profile.avatarUrl as string | undefined,
                    roleIds: roleMap.get(userId) || [],
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
