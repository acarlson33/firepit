/**
 * Prune duplicate one-on-one conversations.
 *
 * Finds conversations between the same pair of users and keeps only the
 * "best" one (the one with the most messages, or the oldest if tied).
 * Deletes the duplicates and their associated direct messages.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/prune-duplicate-conversations.ts [--dry-run] [--user-id <id>]
 *
 * Flags:
 *   --dry-run    Only report what would be deleted (default: true)
 *   --execute    Actually delete duplicates
 *   --user-id    Only prune conversations for a specific user
 */

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

interface ConversationDoc {
    $id: string;
    participants: string[];
    lastMessageAt?: string;
    $createdAt: string;
    isGroup?: boolean;
    [key: string]: unknown;
}

interface MessageCount {
    conversationId: string;
    count: number;
}

async function getMessageCounts(
    databases: Databases,
    databaseId: string,
    directMessagesCollectionId: string,
    conversationIds: string[],
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    // Query in batches of 100 to avoid Appwrite query limits
    for (let i = 0; i < conversationIds.length; i += 100) {
        const batch = conversationIds.slice(i, i + 100);
        if (batch.length === 0) continue;

        try {
            const response = await databases.listDocuments(
                databaseId,
                directMessagesCollectionId,
                [
                    Query.equal("conversationId", batch),
                    Query.limit(1),
                ],
            );

            // The above only returns 1 document total, not per conversation.
            // We need a different approach — count per conversation.
        } catch {
            // Fall back to individual counts below
        }
    }

    // Count messages per conversation individually
    // This is slower but reliable
    for (const convId of conversationIds) {
        try {
            let count = 0;
            let offset = 0;
            for (;;) {
                const response = await databases.listDocuments(
                    databaseId,
                    directMessagesCollectionId,
                    [
                        Query.equal("conversationId", convId),
                        Query.limit(100),
                        Query.offset(offset),
                    ],
                );
                count += response.documents.length;
                if (response.documents.length < 100) break;
                offset += 100;
            }
            counts.set(convId, count);
        } catch (error) {
            warn(`Failed to count messages for conversation ${convId}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            counts.set(convId, 0);
        }
    }

    return counts;
}

async function deleteConversationAndMessages(
    databases: Databases,
    databaseId: string,
    conversationsCollectionId: string,
    directMessagesCollectionId: string,
    conversationId: string,
): Promise<void> {
    // Delete all messages first
    let offset = 0;
    for (;;) {
        const messages = await databases.listDocuments(
            databaseId,
            directMessagesCollectionId,
            [
                Query.equal("conversationId", conversationId),
                Query.limit(100),
                Query.offset(offset),
            ],
        );

        if (messages.documents.length === 0) break;

        await Promise.all(
            messages.documents.map((msg) =>
                databases.deleteDocument(
                    databaseId,
                    directMessagesCollectionId,
                    msg.$id,
                ).catch((err) => {
                    warn(`Failed to delete message ${msg.$id}: ${err}`);
                }),
            ),
        );

        offset += 100;
    }

    // Delete the conversation itself
    await databases.deleteDocument(
        databaseId,
        conversationsCollectionId,
        conversationId,
    );
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes("--execute");
    const userIdFilter = args.includes("--user-id")
        ? args[args.indexOf("--user-id") + 1]
        : undefined;

    if (dryRun) {
        info("Running in DRY-RUN mode (no deletions). Use --execute to actually delete.");
    } else {
        info("Running in EXECUTE mode — duplicates will be deleted!");
    }

    if (userIdFilter) {
        info(`Filtering to user: ${userIdFilter}`);
    }

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
    const conversationsCollectionId =
        env.collections.conversations || "conversations";
    const directMessagesCollectionId =
        env.collections.directMessages || "direct_messages";

    const client = new Client()
        .setEndpoint(endpoint)
        .setProject(project)
        .setKey(apiKey);
    const databases = new Databases(client);

    // Step 1: Fetch all conversations
    info("Fetching conversations...");
    const allConversations: ConversationDoc[] = [];
    let offset = 0;
    for (;;) {
        const response = await databases.listDocuments(
            databaseId,
            conversationsCollectionId,
            [Query.limit(100), Query.offset(offset)],
        );

        if (response.documents.length === 0) break;

        for (const doc of response.documents) {
            const conv = doc as unknown as ConversationDoc;
            // Normalize participants to sorted array
            if (Array.isArray(conv.participants)) {
                conv.participants = [...conv.participants].sort();
            }
            allConversations.push(conv);
        }

        offset += 100;
    }

    info(`Found ${allConversations.length} total conversations.`);

    // Step 2: Filter to one-on-one conversations only (skip groups)
    const oneToOne = allConversations.filter((conv) => {
        if (conv.isGroup) return false;
        if (!Array.isArray(conv.participants)) return false;
        return conv.participants.length === 2;
    });

    info(`Found ${oneToOne.length} one-to-one conversations.`);

    // Step 3: Group by participant pair
    const pairKey = (participants: string[]) => participants.join("|");
    const byPair = new Map<string, ConversationDoc[]>();

    for (const conv of oneToOne) {
        const key = pairKey(conv.participants);
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key)!.push(conv);
    }

    // Step 4: Find duplicates (pairs with more than 1 conversation)
    const duplicatePairs: Array<{
        key: string;
        participants: string[];
        conversations: ConversationDoc[];
    }> = [];

    for (const [key, convs] of byPair) {
        if (convs.length > 1) {
            duplicatePairs.push({
                key,
                participants: convs[0].participants,
                conversations: convs,
            });
        }
    }

    info(`Found ${duplicatePairs.length} participant pairs with duplicate conversations.`);

    if (duplicatePairs.length === 0) {
        info("No duplicates found. Nothing to do.");
        return;
    }

    // Step 5: For each duplicate pair, determine which to keep
    // We need message counts to decide which conversation to keep
    const allDuplicateIds = duplicatePairs.flatMap((p) =>
        p.conversations.map((c) => c.$id),
    );

    info(`Counting messages across ${allDuplicateIds.length} duplicate conversations...`);
    const messageCounts = await getMessageCounts(
        databases,
        databaseId,
        directMessagesCollectionId,
        allDuplicateIds,
    );

    let totalDeleted = 0;
    let totalMessagesDeleted = 0;

    for (const pair of duplicatePairs) {
        const { participants, conversations } = pair;

        // If user filter is set, skip pairs that don't include the user
        if (
            userIdFilter &&
            !participants.includes(userIdFilter)
        ) {
            continue;
        }

        // Sort: keep the one with the most messages; tiebreak by oldest $createdAt
        const sorted = [...conversations].sort((a, b) => {
            const countA = messageCounts.get(a.$id) ?? 0;
            const countB = messageCounts.get(b.$id) ?? 0;
            if (countB !== countA) return countB - countA; // most messages first
            return a.$createdAt.localeCompare(b.$createdAt); // oldest first
        });

        const keeper = sorted[0];
        const duplicates = sorted.slice(1);

        info(
            `Pair [${participants.join(", ")}]: keeping ${keeper.$id} (${messageCounts.get(keeper.$id) ?? 0} messages), deleting ${duplicates.length} duplicate(s).`,
        );

        for (const dup of duplicates) {
            const msgCount = messageCounts.get(dup.$id) ?? 0;
            info(
                `  - Deleting conversation ${dup.$id} (${msgCount} messages, created ${dup.$createdAt})`,
            );

            if (!dryRun) {
                try {
                    await deleteConversationAndMessages(
                        databases,
                        databaseId,
                        conversationsCollectionId,
                        directMessagesCollectionId,
                        dup.$id,
                    );
                    totalDeleted++;
                    totalMessagesDeleted += msgCount;
                } catch (error) {
                    warn(`Failed to delete conversation ${dup.$id}`, {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            } else {
                totalDeleted++;
                totalMessagesDeleted += msgCount;
            }
        }
    }

    if (dryRun) {
        info(
            `DRY-RUN complete. Would delete ${totalDeleted} conversations and ${totalMessagesDeleted} messages.`,
        );
        info("Run with --execute to actually delete.");
    } else {
        info(
            `Done. Deleted ${totalDeleted} conversations and ${totalMessagesDeleted} messages.`,
        );
    }
}

main().catch((error) => {
    fail("Unhandled error", {
        error: error instanceof Error ? error.message : String(error),
    });
});
