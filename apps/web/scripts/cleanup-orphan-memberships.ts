import { config as loadDotenv } from "dotenv";
import { Client, Databases, Query } from "node-appwrite";
import { getEnvConfig } from "../src/lib/appwrite-core";

loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local", override: true });

function info(message: string, data?: Record<string, unknown>) {
    if (data) {
        process.stdout.write(`${message} ${JSON.stringify(data)}\n`);
        return;
    }
    process.stdout.write(`${message}\n`);
}

function warn(message: string, data?: Record<string, unknown>) {
    if (data) {
        process.stderr.write(`[warn] ${message} ${JSON.stringify(data)}\n`);
        return;
    }
    process.stderr.write(`[warn] ${message}\n`);
}

function fail(message: string, data?: Record<string, unknown>) {
    if (data) {
        process.stderr.write(`[error] ${message} ${JSON.stringify(data)}\n`);
    } else {
        process.stderr.write(`[error] ${message}\n`);
    }
    process.exit(1);
}

async function main() {
    const env = getEnvConfig();
    const endpoint = env.endpoint;
    const project = env.project;
    const apiKey = process.env.APPWRITE_API_KEY || "";

    if (!endpoint || !project || !apiKey) {
        fail("Missing Appwrite configuration", {
            endpoint,
            project,
            apiKey: apiKey ? "set" : "missing",
        });
    }

    const databaseId = env.databaseId || "main";
    const membershipsCollectionId =
        env.collections.memberships || "memberships";
    const profilesCollectionId = env.collections.profiles || "profiles";
    const roleAssignmentsCollectionId = "role_assignments";

    const client = new Client().setEndpoint(endpoint).setProject(project);
    if (
        typeof (client as unknown as { setKey?: (k: string) => void })
            .setKey === "function"
    ) {
        (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
    }
    const databases = new Databases(client);

    let membershipsChecked = 0;
    let membershipsDeleted = 0;
    let assignmentsDeleted = 0;
    let offset = 0;

    info("Starting orphan membership cleanup...");

    for (;;) {
        const queries = [Query.limit(100), Query.offset(offset)];

        const page = await databases.listDocuments(
            databaseId,
            membershipsCollectionId,
            queries,
        );

        if (page.documents.length === 0) {
            break;
        }

        const results = await Promise.all(
            page.documents.map(async (membership) => {
                const userId = membership.userId as string;
                const serverId = membership.serverId as string;
                membershipsChecked += 1;

                try {
                    const profiles = await databases.listDocuments(
                        databaseId,
                        profilesCollectionId,
                        [Query.equal("userId", userId), Query.limit(1)],
                    );

                    if (profiles.documents.length > 0) {
                        return;
                    }

                    await databases.deleteDocument(
                        databaseId,
                        membershipsCollectionId,
                        membership.$id,
                    );
                    membershipsDeleted += 1;

                    // Clean role assignments for this user/server
                    let assignmentCursor: string | null = null;
                    for (;;) {
                        const assignmentQueries = [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userId),
                            Query.limit(100),
                        ];
                        if (assignmentCursor) {
                            assignmentQueries.push(
                                Query.cursorAfter(assignmentCursor),
                            );
                        }

                        const assignmentPage = await databases.listDocuments(
                            databaseId,
                            roleAssignmentsCollectionId,
                            assignmentQueries,
                        );

                        if (assignmentPage.documents.length === 0) {
                            break;
                        }

                        assignmentCursor = String(
                            assignmentPage.documents[
                                assignmentPage.documents.length - 1
                            ].$id,
                        );

                        await Promise.all(
                            assignmentPage.documents.map((assignment) =>
                                databases.deleteDocument(
                                    databaseId,
                                    roleAssignmentsCollectionId,
                                    assignment.$id,
                                ),
                            ),
                        );
                        assignmentsDeleted += assignmentPage.documents.length;
                    }

                    info("Removed orphan membership", { serverId, userId });
                } catch (error) {
                    warn("Failed to process membership", {
                        serverId,
                        userId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }),
        );

        // results consumed to satisfy lint about unused promise array
        void results;

        if (page.documents.length < 100) {
            break;
        }

        // Advance offset by page size; deletions shrink the dataset, so this may
        // re-read a few items, but avoids cursor-not-found failures when the
        // last item is removed during processing.
        offset += 100;
    }

    info("Cleanup complete", {
        membershipsChecked,
        membershipsDeleted,
        assignmentsDeleted,
    });
}

main().catch((error) => {
    fail("Fatal error", {
        error: error instanceof Error ? error.message : String(error),
    });
});
