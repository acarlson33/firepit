import { config as loadDotenv } from "dotenv";
import { Client, Databases, Query } from "node-appwrite";

import { getEnvConfig } from "../src/lib/appwrite-core";
import { deriveThreadReadDocumentId } from "../src/lib/thread-read-store";
import { mergeThreadReadsByMax } from "../src/lib/thread-read-store";
import { normalizeThreadReads } from "../src/lib/thread-read-states";

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
    const apiKey = process.env.APPWRITE_API_KEY || "";
    if (!env.endpoint || !env.project || !apiKey) {
        fail("Missing Appwrite configuration", {
            endpoint: env.endpoint,
            project: env.project,
            apiKey: apiKey ? "set" : "missing",
        });
    }

    const databaseId = env.databaseId || "main";
    const collectionId = env.collections.threadReads || "thread_reads";

    const client = new Client().setEndpoint(env.endpoint).setProject(env.project);
    if (
        typeof (client as unknown as { setKey?: (k: string) => void })
            .setKey === "function"
    ) {
        (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
    }
    const databases = new Databases(client);

    let scanned = 0;
    let migrated = 0;
    let merged = 0;
    let cursor: string | null = null;

    info("Starting thread-read document id backfill...");

    for (;;) {
        const queries = [Query.limit(100)];
        if (cursor) {
            queries.push(Query.cursorAfter(cursor));
        }

        const page = await databases.listDocuments(databaseId, collectionId, queries);
        if (page.documents.length === 0) {
            break;
        }

        // Capture the pagination anchor before mutating this page, since the
        // documents below may be deleted during migration.
        cursor = String(page.documents[page.documents.length - 1].$id);

        for (const document of page.documents) {
            scanned += 1;
            const contextId = String(document.contextId ?? "");
            const contextType = String(document.contextType ?? "");
            const userId = String(document.userId ?? "");
            if (!contextId || !contextType || !userId) {
                warn("Skipping document with missing identity fields", {
                    $id: document.$id,
                });
                continue;
            }

            const derivedId = deriveThreadReadDocumentId({
                contextId,
                contextType: contextType as "channel" | "conversation",
                userId,
            });
            if (derivedId === document.$id) {
                continue;
            }

            try {
                const existing = await databases.getDocument(
                    databaseId,
                    collectionId,
                    derivedId,
                );
                const mergedReads = mergeThreadReadsByMax({
                    existingReads: normalizeThreadReads(existing.reads),
                    incomingReads: normalizeThreadReads(document.reads),
                });
                await databases.updateDocument(databaseId, collectionId, derivedId, {
                    reads: JSON.stringify(mergedReads),
                });
                merged += 1;
            } catch (error) {
                const candidate = error as { code?: number };
                if (candidate.code !== 404) {
                    throw error;
                }

                await databases.createDocument(
                    databaseId,
                    collectionId,
                    derivedId,
                    {
                        contextId,
                        contextType,
                        reads: JSON.stringify(normalizeThreadReads(document.reads)),
                        userId,
                    },
                    document.$permissions,
                );
                migrated += 1;
            }

            await databases.deleteDocument(databaseId, collectionId, document.$id);
        }
    }

    info("Thread-read id backfill complete", { scanned, migrated, merged });
}

main().catch((error) => {
    fail("Backfill failed", {
        error: error instanceof Error ? error.message : String(error),
    });
});
