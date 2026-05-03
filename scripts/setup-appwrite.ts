/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Idempotent Appwrite bootstrap script.
 * Creates database, collections, string attributes, indexes, teams, and storage buckets if they do not exist.
 * Safe to re-run. Avoids console.* per project lint rules (writes directly to stdout/stderr).
 */
import { config as loadDotenv } from "dotenv";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query, Storage, Teams } from "node-appwrite";

const envFiles = [".env", ".env.local"];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const searchRoots = new Set([process.cwd(), scriptDir]);

function findEnvPaths(): string[] {
    const found: string[] = [];
    for (const root of searchRoots) {
        let current = path.resolve(root);
        for (;;) {
            for (const envFile of envFiles) {
                const envPath = path.join(current, envFile);
                if (existsSync(envPath)) {
                    found.push(envPath);
                }
            }
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }
    return found;
}

for (const envPath of findEnvPaths()) {
    loadDotenv({ path: envPath, override: true });
}

// ---- Environment (DO NOT hardcode secrets) ----
const endpoint = process.env.APPWRITE_ENDPOINT;
if (!endpoint) {
    throw new Error("APPWRITE_ENDPOINT is required");
}
const project = process.env.APPWRITE_PROJECT_ID;
if (!project) {
    throw new Error("APPWRITE_PROJECT_ID is required");
}
const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
    throw new Error("APPWRITE_API_KEY is required");
}
const skipTeams = /^(1|true|yes)$/i.test(process.env.SKIP_TEAMS ?? "");

// ---- Constants ----
const DB_ID = "main";
const ANNOUNCEMENTS_COLLECTION_ID =
    process.env.APPWRITE_ANNOUNCEMENTS_COLLECTION_ID?.trim() ||
    "announcements";
const ANNOUNCEMENT_DELIVERIES_COLLECTION_ID =
    process.env.APPWRITE_ANNOUNCEMENT_DELIVERIES_COLLECTION_ID?.trim() ||
    "announcement_deliveries";
const GIFS_BUCKET_ID = process.env.APPWRITE_GIFS_BUCKET_ID?.trim() || "gifs";
const STICKERS_BUCKET_ID =
    process.env.APPWRITE_STICKERS_BUCKET_ID?.trim() || "stickers";
const LEN_ID = 128;
const LEN_TS = 64; // ISO / epoch string length allowance
const LEN_TEXT = 4000; // generous message / meta text length
const LEN_TEXT_LARGE = 65_535; // large JSON payloads (e.g., thread read maps)

// ---- Client ----
const client = new Client().setEndpoint(endpoint).setProject(project);
if (
    typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
    "function"
) {
    (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);
const teams = new Teams(client);
const storage = new Storage(client);

// Provide compatibility with potential SDK signature variants (object vs positional)
const dbAny = databases as any;
const storageAny = storage as any;

export function createFeatureFlagDocumentId(flagKey: string): string {
    const MAX_PREFIX_LEN = 18;
    const readablePrefix = flagKey
        .replace(/[^a-z0-9_-]/gi, "_")
        .toLowerCase()
        .replace(/^_+|_+$/g, "")
        .slice(0, MAX_PREFIX_LEN)
        .replace(/^_+|_+$/g, "");
    const hashSuffix = createHash("sha256")
        .update(flagKey)
        .digest("hex")
        .slice(0, 12);

    return `flag_${readablePrefix || "key"}_${hashSuffix}`;
}

export function isDuplicateConflictError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        code?: unknown;
        message?: unknown;
        response?: { code?: unknown; message?: unknown };
        type?: unknown;
    };

    let code: number | null = null;
    if (typeof candidate.code === "number") {
        code = candidate.code;
    } else if (typeof candidate.response?.code === "number") {
        code = candidate.response.code;
    } else {
        code = null;
    }
    if (code === 409) {
        return true;
    }

    const messageParts = [
        candidate.message,
        candidate.response?.message,
        candidate.type,
    ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();

    return (
        messageParts.includes("duplicate") ||
        messageParts.includes("already exists") ||
        messageParts.includes("conflict")
    );
}

async function tryVariants<T>(variants: Array<() => Promise<T>>): Promise<T> {
    let lastErr: unknown;
    for (const v of variants) {
        try {
            return await v();
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr as Error;
}

const shouldUseAnsi =
    Boolean(process.stdout.isTTY) &&
    !/^(1|true)$/i.test(process.env.NO_COLOR ?? "");

const ANSI = {
    reset: "\u001B[0m",
    dim: "\u001B[2m",
    bold: "\u001B[1m",
    cyan: "\u001B[36m",
    green: "\u001B[32m",
    yellow: "\u001B[33m",
    red: "\u001B[31m",
    blue: "\u001B[34m",
} as const;

const logStats = {
    sections: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    waiting: 0,
    warnings: 0,
    errors: 0,
};

function colorize(text: string, color: string) {
    if (!shouldUseAnsi) {
        return text;
    }

    return `${color}${text}${ANSI.reset}`;
}

function writeStdout(line = "") {
    process.stdout.write(`${line}\n`);
}

function writeStderr(line: string) {
    process.stderr.write(`${line}\n`);
}

function normalizeSetupMessage(msg: string) {
    return msg.replace(/^\[(setup|warn|error)\]\s*/i, "").trim();
}

function logSection(title: string) {
    logStats.sections += 1;
    writeStdout();
    writeStdout(colorize(`${ANSI.bold}== ${title} ==${ANSI.reset}`, ANSI.cyan));
}

function logSummary() {
    writeStdout();
    writeStdout(colorize(`${ANSI.bold}== Summary ==${ANSI.reset}`, ANSI.cyan));
    writeStdout(
        [
            `sections: ${logStats.sections}`,
            `created: ${logStats.created}`,
            `updated: ${logStats.updated}`,
            `skipped: ${logStats.skipped}`,
            `waiting: ${logStats.waiting}`,
            `warnings: ${logStats.warnings}`,
            `errors: ${logStats.errors}`,
        ].join(" | "),
    );
}

function info(msg: string) {
    const message = normalizeSetupMessage(msg);

    if (message.startsWith("Setting up ")) {
        logSection(message.replace(/^Setting up /, "").replace(/\.\.\.$/, ""));
        return;
    }

    let label = "info";
    let color: string = ANSI.blue;

    if (message.includes("created") || message.includes("added")) {
        label = "ok";
        color = ANSI.green;
        logStats.created += 1;
    } else if (
        message.includes("already exists") ||
        message.startsWith("skipping ") ||
        message.includes("is available")
    ) {
        label = "skip";
        color = ANSI.dim;
        logStats.skipped += 1;
    } else if (
        message.includes("waiting for") ||
        message.includes("retrying index") ||
        message.includes("not found yet")
    ) {
        label = "wait";
        color = ANSI.yellow;
        logStats.waiting += 1;
    }

    writeStdout(`${colorize(`[${label}]`, color)} ${message}`);
}

function warn(msg: string) {
    logStats.warnings += 1;
    const message = normalizeSetupMessage(msg);
    writeStderr(`${colorize("[warn]", ANSI.yellow)} ${message}`);
}

function err(msg: string) {
    logStats.errors += 1;
    const message = normalizeSetupMessage(msg);
    writeStderr(`${colorize("[error]", ANSI.red)} ${message}`);
}

// ---- Ensure primitives ----
async function ensureDatabase() {
    try {
        await tryVariants([
            () => dbAny.get(DB_ID),
            () => dbAny.getDatabase?.(DB_ID),
            () => dbAny.getDatabase?.({ databaseId: DB_ID }),
        ]);
    } catch {
        await tryVariants([
            () => dbAny.create(DB_ID, "Main"),
            () => dbAny.createDatabase?.(DB_ID, "Main"),
            () => dbAny.createDatabase?.({ databaseId: DB_ID, name: "Main" }),
        ]);
        info(`[setup] created database '${DB_ID}'`);
    }
}

async function ensureCollection(id: string, name: string) {
    try {
        await tryVariants([
            () => dbAny.getCollection(DB_ID, id),
            () =>
                dbAny.getCollection?.({ databaseId: DB_ID, collectionId: id }),
        ]);
    } catch {
        await tryVariants([
            () => dbAny.createCollection(DB_ID, id, name, [], true),
            () =>
                dbAny.createCollection?.({
                    databaseId: DB_ID,
                    collectionId: id,
                    name,
                    permissions: [],
                    documentSecurity: true,
                }),
        ]);
        info(
            `[setup] created collection '${id}' with document-level security enabled`,
        );
    }
}

async function ensureStringAttribute(
    collection: string,
    key: string,
    size: number,
    required: boolean,
) {
    try {
        await tryVariants([
            () => dbAny.getAttribute(DB_ID, collection, key),
            () =>
                dbAny.getAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                }),
        ]);
    } catch {
        await tryVariants([
            () =>
                dbAny.createStringAttribute(
                    DB_ID,
                    collection,
                    key,
                    size,
                    required,
                ),
            () =>
                dbAny.createStringAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                    size,
                    required,
                }),
        ]);
        info(`[setup] added ${collection}.${key}`);
    }
}

async function ensureBooleanAttribute(
    collection: string,
    key: string,
    required: boolean,
) {
    try {
        await tryVariants([
            () => dbAny.getAttribute(DB_ID, collection, key),
            () =>
                dbAny.getAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                }),
        ]);
    } catch {
        await tryVariants([
            () =>
                dbAny.createBooleanAttribute(DB_ID, collection, key, required),
            () =>
                dbAny.createBooleanAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                    required,
                }),
        ]);
        info(`[setup] added ${collection}.${key} (boolean)`);
    }
}

async function ensureIntegerAttribute(
    collection: string,
    key: string,
    required: boolean,
    defaultValue?: number,
    min?: number,
    max?: number,
) {
    try {
        await tryVariants([
            () => dbAny.getAttribute(DB_ID, collection, key),
            () =>
                dbAny.getAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                }),
        ]);
    } catch {
        await tryVariants([
            () =>
                dbAny.createIntegerAttribute(
                    DB_ID,
                    collection,
                    key,
                    required,
                    min,
                    max,
                    defaultValue,
                ),
            () =>
                dbAny.createIntegerAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                    required,
                    min,
                    max,
                    default: defaultValue,
                }),
        ]);
        info(`[setup] added ${collection}.${key} (integer)`);
    }
}

async function ensureStringArrayAttribute(
    collection: string,
    key: string,
    size: number,
    required: boolean,
) {
    try {
        await tryVariants([
            () => dbAny.getAttribute(DB_ID, collection, key),
            () =>
                dbAny.getAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                }),
        ]);
    } catch {
        await tryVariants([
            () =>
                dbAny.createStringAttribute(
                    DB_ID,
                    collection,
                    key,
                    size,
                    required,
                    undefined,
                    true,
                ),
            () =>
                dbAny.createStringAttribute?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key,
                    size,
                    required,
                    array: true,
                }),
        ]);
        info(`[setup] added ${collection}.${key} (string array)`);
    }
}

async function updateStringAttributeSize(
    collection: string,
    key: string,
    size: number,
    required: boolean,
) {
    const apiPath = `/databases/${DB_ID}/collections/${collection}/attributes/string/${key}`;

    let response: Response;
    try {
        response = await fetch(`${endpoint}${apiPath}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                "x-appwrite-key": apiKey,
                "x-appwrite-project": project,
            },
            body: JSON.stringify({
                required,
                default: null,
                size,
            }),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        if (
            error instanceof DOMException &&
            (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
            throw new Error(
                `Timed out patching ${collection}.${key} (30s): ${apiPath}`,
            );
        }
        throw error;
    }

    if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
            `HTTP ${response.status} ${response.statusText}: ${responseBody}`,
        );
    }
}

type IndexType = "key" | "fulltext" | "unique"; // subset used
type EnsureIndexOptions = {
    recreateIfMismatched?: boolean;
};

function isAttributePropagationError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("attribute not available") ||
        normalized.includes("requested attribute") ||
        normalized.includes("not yet available")
    );
}

async function waitForAttribute(
    collection: string,
    key: string,
    maxAttempts = 10,
    delayMs = 1000,
): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const attr = await tryVariants([
                () => dbAny.getAttribute(DB_ID, collection, key),
                () =>
                    dbAny.getAttribute?.({
                        databaseId: DB_ID,
                        collectionId: collection,
                        key,
                    }),
            ]);
            // Check if attribute is available (status should be 'available')
            const status = String((attr as any).status);
            if (status === "available") {
                info(`[setup] attribute ${collection}.${key} is available`);
                return;
            }
            info(
                `[setup] waiting for ${collection}.${key} (status: ${status}, attempt ${i + 1}/${maxAttempts})`,
            );
        } catch (e) {
            // Attribute doesn't exist yet, wait and retry
            info(
                `[setup] ${collection}.${key} not found yet (attempt ${i + 1}/${maxAttempts})`,
            );
        }
        if (i < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    throw new Error(
        `Attribute ${collection}.${key} did not become available after ${maxAttempts} attempts`,
    );
}

function normalizeIndexAttributes(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((attribute) => String(attribute));
}

function indexDefinitionMatches(params: {
    actualAttributes: string[];
    actualType: string;
    expectedAttributes: string[];
    expectedType: IndexType;
}): boolean {
    const { actualAttributes, actualType, expectedAttributes, expectedType } =
        params;

    if (actualType !== expectedType) {
        return false;
    }

    if (actualAttributes.length !== expectedAttributes.length) {
        return false;
    }

    return actualAttributes.every(
        (attribute, index) => attribute === expectedAttributes[index],
    );
}

async function deleteIndex(collection: string, name: string): Promise<void> {
    await tryVariants([
        () => dbAny.deleteIndex(DB_ID, collection, name),
        () =>
            dbAny.deleteIndex?.({
                collectionId: collection,
                databaseId: DB_ID,
                key: name,
            }),
    ]);
}

async function createIndexWithRetries(
    collection: string,
    name: string,
    type: IndexType,
    attributes: string[],
): Promise<void> {
    // Wait for all attributes to be available before creating index.
    for (const attr of attributes) {
        if (attr.startsWith("$")) {
            // System attributes are always available and are not returned by attribute APIs.
            continue;
        }
        await waitForAttribute(collection, attr);
    }

    // Retry index creation with backoff if attributes aren't ready.
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
            const delay = 2000 * attempt; // Progressive delay: 2s, 4s, 6s, 8s
            info(
                `[setup] retrying index ${collection}.${name} after ${delay}ms delay (attempt ${attempt + 1}/5)`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
            await tryVariants([
                () =>
                    dbAny.createIndex(
                        DB_ID,
                        collection,
                        name,
                        type,
                        attributes,
                    ),
                () =>
                    dbAny.createIndex?.({
                        databaseId: DB_ID,
                        collectionId: collection,
                        key: name,
                        type,
                        attributes,
                    }),
            ]);
            info(`[setup] created index ${collection}.${name}`);
            return; // Success
        } catch (e) {
            lastError = e as Error;
            const errMsg = lastError.message || "";

            if (isAttributePropagationError(errMsg)) {
                for (const attr of attributes) {
                    if (attr.startsWith("$")) {
                        continue;
                    }
                    await waitForAttribute(collection, attr);
                }
                continue;
            }

            if (type === "fulltext") {
                warn(
                    `skipping fulltext index ${collection}.${name}: ${lastError.message}`,
                );
                return;
            }

            throw e;
        }
    }

    if (type === "fulltext") {
        warn(
            `skipping fulltext index ${collection}.${name}: ${lastError?.message ?? "unknown error"}`,
        );
    } else {
        throw lastError ?? new Error("Failed to create index after retries");
    }
}

async function listAllDocuments(params: {
    collectionId: string;
    pageLimit?: number;
    queries?: string[];
}) {
    const {
        collectionId,
        pageLimit = 100,
        queries = [Query.orderAsc("$id")],
    } = params;
    const documents: Record<string, unknown>[] = [];
    let cursorAfter: string | null = null;

    while (true) {
        const pageQueries = [
            ...queries,
            Query.limit(pageLimit),
            ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
        ];

        const response = await tryVariants([
            () => dbAny.listDocuments(DB_ID, collectionId, pageQueries),
            () =>
                dbAny.listDocuments?.({
                    databaseId: DB_ID,
                    collectionId,
                    queries: pageQueries,
                }),
        ]);

        const pageDocuments = Array.isArray(response.documents)
            ? (response.documents as Record<string, unknown>[])
            : [];
        documents.push(...pageDocuments);

        if (pageDocuments.length < pageLimit) {
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

async function ensureIndex(
    collection: string,
    name: string,
    type: IndexType,
    attributes: string[],
    options?: EnsureIndexOptions,
) {
    const recreateIfMismatched = options?.recreateIfMismatched === true;

    try {
        const existing = await tryVariants([
            () => dbAny.getIndex(DB_ID, collection, name),
            () =>
                dbAny.getIndex?.({
                    databaseId: DB_ID,
                    collectionId: collection,
                    key: name,
                }),
        ]);

        const existingType = String((existing as { type?: unknown }).type ?? "");
        const existingAttributes = normalizeIndexAttributes(
            (existing as { attributes?: unknown }).attributes,
        );
        const definitionMatches = indexDefinitionMatches({
            actualAttributes: existingAttributes,
            actualType: existingType,
            expectedAttributes: attributes,
            expectedType: type,
        });

        if (!definitionMatches) {
            if (!recreateIfMismatched) {
                warn(
                    `index ${collection}.${name} exists with unexpected definition (type=${existingType || "unknown"}, attributes=${existingAttributes.join(",",
                    )}); expected type=${type}, attributes=${attributes.join(",")}.`,
                );
                return;
            }

            warn(
                `recreating index ${collection}.${name} due to definition mismatch (type=${existingType || "unknown"} -> ${type})`,
            );
            await deleteIndex(collection, name);
            await createIndexWithRetries(collection, name, type, attributes);
            return;
        }

        info(
            `[setup] index ${collection}.${name} already exists (status: ${String((existing as any).status)})`,
        );
    } catch {
        await createIndexWithRetries(collection, name, type, attributes);
    }
}

async function migrateLegacyServersIsPublic(
    defaultVisibility: boolean,
): Promise<void> {
    const shouldRun = /^(1|true|yes)$/i.test(
        process.env.MIGRATE_LEGACY_SERVERS_IS_PUBLIC ?? "",
    );
    if (!shouldRun) {
        return;
    }

    const missingVisibilityServers = await listAllDocuments({
        collectionId: "servers",
        queries: [Query.isNull("isPublic"), Query.orderAsc("$id")],
    });

    if (missingVisibilityServers.length === 0) {
        info("[setup] no legacy servers missing isPublic found");
        return;
    }

    let migratedCount = 0;
    for (const document of missingVisibilityServers) {
        const serverId = String(document.$id ?? "");
        if (!serverId) {
            continue;
        }

        await tryVariants([
            () =>
                dbAny.updateDocument(DB_ID, "servers", serverId, {
                    isPublic: defaultVisibility,
                }),
            () =>
                dbAny.updateDocument?.({
                    data: { isPublic: defaultVisibility },
                    databaseId: DB_ID,
                    documentId: serverId,
                    collectionId: "servers",
                }),
        ]);
        migratedCount += 1;
    }

    info(
        `[setup] migrated ${String(migratedCount)} legacy server(s) with missing isPublic to ${String(defaultVisibility)}`,
    );
}

async function backfillAnnouncementIdempotencyKeys(): Promise<void> {
    const announcements = await listAllDocuments({
        collectionId: ANNOUNCEMENTS_COLLECTION_ID,
    });

    if (announcements.length === 0) {
        return;
    }

    let updatedCount = 0;
    for (const announcement of announcements) {
        const announcementId = String(announcement.$id ?? "");
        const idempotencyKey =
            typeof announcement.idempotencyKey === "string"
                ? announcement.idempotencyKey.trim()
                : "";

        if (!announcementId || idempotencyKey.length > 0) {
            continue;
        }

        const fallbackIdempotencyKey = `legacy:${announcementId}`.slice(0, LEN_ID);
        await tryVariants([
            () =>
                dbAny.updateDocument(
                    DB_ID,
                    ANNOUNCEMENTS_COLLECTION_ID,
                    announcementId,
                    {
                        idempotencyKey: fallbackIdempotencyKey,
                    },
                ),
            () =>
                dbAny.updateDocument?.({
                    data: { idempotencyKey: fallbackIdempotencyKey },
                    databaseId: DB_ID,
                    documentId: announcementId,
                    collectionId: ANNOUNCEMENTS_COLLECTION_ID,
                }),
        ]);
        updatedCount += 1;
    }

    if (updatedCount > 0) {
        info(
            `[setup] backfilled idempotencyKey for ${String(updatedCount)} announcement(s)`,
        );
    }
}

async function ensureNoDuplicateIdempotencyKeys(): Promise<void> {
    const duplicateGroups = await listAllDocuments({
        collectionId: ANNOUNCEMENTS_COLLECTION_ID,
        queries: [Query.notEqual("idempotencyKey", "")],
    });

    const keyCounts = new Map<string, string[]>();
    for (const doc of duplicateGroups) {
        const key = `${doc.createdBy}_${doc.idempotencyKey}` as string;
        if (!key) continue;
        const existing = keyCounts.get(key) ?? [];
        existing.push(String(doc.$id));
        keyCounts.set(key, existing);
    }

    const duplicates: Array<{ key: string; ids: string[] }> = [];
    for (const [key, ids] of keyCounts) {
        if (ids.length > 1) {
            duplicates.push({ key, ids });
        }
    }

    if (duplicates.length > 0) {
        throw new Error(
            `Migration aborted: found ${duplicates.length} duplicate idempotencyKey values. ` +
            `Sample duplicates: ${duplicates.slice(0, 3).map(d => `key='${d.key}' (${d.ids.length} docs: ${d.ids.slice(0, 2).join(", ")})`).join(", ")}. ` +
            `Remove duplicates or clean idempotencyKey before creating unique index.`,
        );
    }

    info("[setup] no duplicate idempotencyKey values found");
}

// ---- Domain Specific Setup ----
async function setupServers() {
    await ensureCollection("servers", "Servers");
    await ensureStringAttribute("servers", "name", LEN_ID, true);
    await ensureStringAttribute("servers", "ownerId", LEN_ID, true);
    await ensureStringAttribute("servers", "description", 500, false);
    await ensureStringAttribute("servers", "iconFileId", LEN_ID, false);
    await ensureStringAttribute("servers", "bannerFileId", LEN_ID, false);
    await ensureBooleanAttribute("servers", "isPublic", false);
    await ensureBooleanAttribute("servers", "defaultOnSignup", false);
    const migrateServersVisibilityDefault = /^(1|true|yes)$/i.test(
        process.env.MIGRATE_LEGACY_SERVERS_IS_PUBLIC_DEFAULT ?? "",
    );
    await migrateLegacyServersIsPublic(migrateServersVisibilityDefault);
    await ensureIndex("servers", "idx_isPublic", "key", ["isPublic"]);
    await ensureIndex("servers", "idx_defaultOnSignup", "key", [
        "defaultOnSignup",
    ]);
    // Note: memberCount removed - use getActualMemberCount() to query memberships instead
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
}

async function setupChannels() {
    await ensureCollection("channels", "Channels");
    await ensureStringAttribute("channels", "serverId", LEN_ID, true);
    await ensureStringAttribute("channels", "name", LEN_ID, true);
    await ensureStringAttribute("channels", "type", 32, false);
    await ensureStringAttribute("channels", "topic", 500, false);
    await ensureStringAttribute("channels", "categoryId", LEN_ID, false);
    await ensureIntegerAttribute("channels", "position", false, 0, 0);
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("channels", "idx_serverId", "key", ["serverId"]);
    await ensureIndex("channels", "idx_categoryId", "key", ["categoryId"]);
    await ensureIndex("channels", "idx_type", "key", ["type"]);
    await ensureIndex("channels", "idx_position", "key", ["position"]);
}

async function setupCategories() {
    await ensureCollection("categories", "Categories");
    await ensureStringAttribute("categories", "serverId", LEN_ID, true);
    await ensureStringAttribute("categories", "name", LEN_ID, true);
    await ensureStringAttribute("categories", "createdBy", LEN_ID, false);
    await ensureStringArrayAttribute(
        "categories",
        "allowedRoleIds",
        LEN_ID,
        false,
    );
    await ensureIntegerAttribute("categories", "position", true, 0, 0);
    await ensureIndex("categories", "idx_serverId", "key", ["serverId"]);
    await ensureIndex("categories", "idx_position", "key", ["position"]);
}

async function setupMessages() {
    await ensureCollection("messages", "Messages");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["userName", LEN_ID, false],
        ["text", LEN_TEXT, true],
        ["serverId", LEN_ID, false],
        ["channelId", LEN_ID, false],
        ["editedAt", LEN_TS, false],
        ["removedAt", LEN_TS, false],
        ["removedBy", LEN_ID, false],
        ["replyToId", LEN_ID, false],
        ["threadId", LEN_ID, false],
        ["lastThreadReplyAt", LEN_TS, false],
        ["imageFileId", LEN_ID, false],
        ["imageUrl", 2000, false],
        ["reactions", 2000, false], // JSON string of reactions array (reduced size to fit limit)
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("messages", k, size, req);
    }
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("messages", "idx_userId", "key", ["userId"]);
    await ensureIndex("messages", "idx_channelId", "key", ["channelId"]);
    await ensureIndex("messages", "idx_serverId", "key", ["serverId"]);
    await ensureIndex("messages", "idx_removedAt", "key", ["removedAt"]);
    await ensureIndex("messages", "idx_replyToId", "key", ["replyToId"]);
    await ensureIndex("messages", "idx_threadId", "key", ["threadId"]);
    await ensureIntegerAttribute("messages", "threadMessageCount", false, 0);
    await ensureStringArrayAttribute(
        "messages",
        "threadParticipants",
        LEN_ID,
        false,
    );

    try {
        await ensureIndex("messages", "idx_text_search", "fulltext", ["text"]);
    } catch {
        // optional
    }
}

async function setupMessageAttachments() {
    await ensureCollection("message_attachments", "Message Attachments");

    const requiredStringFields: [string, number][] = [
        ["messageId", LEN_ID],
        ["messageType", 32],
        ["fileId", LEN_ID],
        ["fileName", 512],
        ["fileType", 255],
        ["fileUrl", 2000],
    ];
    for (const [key, size] of requiredStringFields) {
        await ensureStringAttribute("message_attachments", key, size, true);
    }

    const optionalStringFields: [string, number][] = [
        ["thumbnailUrl", 2000],
        ["mediaKind", 32],
        ["source", 32],
        ["provider", 32],
        ["providerAssetId", LEN_ID],
        ["packId", LEN_ID],
        ["itemId", LEN_ID],
        ["previewUrl", 2000],
    ];
    for (const [key, size] of optionalStringFields) {
        await ensureStringAttribute("message_attachments", key, size, false);
    }

    await ensureIntegerAttribute("message_attachments", "fileSize", true, 0, 0);

    await ensureIndex("message_attachments", "idx_message", "key", [
        "messageId",
    ]);
    await ensureIndex("message_attachments", "idx_message_type", "key", [
        "messageType",
    ]);
    await ensureIndex("message_attachments", "idx_message_messageType", "key", [
        "messageId",
        "messageType",
    ]);
}

async function setupAudit() {
    await ensureCollection("audit", "Audit");
    const fields: [string, number, boolean][] = [
        ["action", LEN_ID, true],
        ["targetId", LEN_ID, true],
        ["actorId", LEN_ID, true],
        ["serverId", LEN_ID, false],
        ["userId", LEN_ID, false],
        ["targetUserId", LEN_ID, false],
        ["reason", LEN_TEXT, false],
        ["details", LEN_TEXT, false],
        ["meta", LEN_TEXT, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("audit", k, size, req);
    }
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("audit", "idx_action", "key", ["action"]);
    await ensureIndex("audit", "idx_actor", "key", ["actorId"]);
    await ensureIndex("audit", "idx_target", "key", ["targetId"]);
    await ensureIndex("audit", "idx_server", "key", ["serverId"]);
}

async function setupReports() {
    await ensureCollection("reports", "Reports");
    const fields: [string, number, boolean][] = [
        ["reporterId", LEN_ID, true],
        ["reportedUserId", LEN_ID, true],
        ["justification", LEN_TEXT, true],
        ["status", 32, true],
        ["resolvedBy", LEN_ID, false],
        ["resolutionNotes", LEN_TEXT, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("reports", k, size, req);
    }
    await ensureIndex("reports", "idx_reporter", "key", ["reporterId"]);
    await ensureIndex("reports", "idx_reported_user", "key", [
        "reportedUserId",
    ]);
    await ensureIndex("reports", "idx_status", "key", ["status"]);
    await ensureIndex("reports", "idx_reported_user_status", "key", [
        "reportedUserId",
        "status",
    ]);
    await ensureIndex("reports", "idx_status_createdAt", "key", [
        "status",
        "$createdAt",
    ]);
}

async function setupTyping() {
    await ensureCollection("typing", "Typing");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["userName", LEN_ID, false],
        ["channelId", LEN_ID, true],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("typing", k, size, req);
    }
    await ensureIndex("typing", "idx_channel", "key", ["channelId"]);
    await ensureIndex("typing", "idx_updated", "key", ["$updatedAt"]);
}

async function setupMemberships() {
    await ensureCollection("memberships", "Memberships");
    const fields: [string, number, boolean][] = [
        ["serverId", LEN_ID, true],
        ["userId", LEN_ID, true],
        ["role", LEN_ID, true],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("memberships", k, size, req);
    }
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("memberships", "idx_server", "key", ["serverId"]);
    await ensureIndex("memberships", "idx_user", "key", ["userId"]);
    await ensureIndex("memberships", "idx_server_user", "key", [
        "serverId",
        "userId",
    ]);
}

async function setupBannedUsers() {
    await ensureCollection("banned_users", "Banned Users");
    await ensureStringAttribute("banned_users", "serverId", LEN_ID, true);
    await ensureStringAttribute("banned_users", "userId", LEN_ID, true);
    await ensureStringAttribute("banned_users", "bannedBy", LEN_ID, true);
    await ensureStringAttribute("banned_users", "reason", LEN_TEXT, false);
    await ensureStringAttribute("banned_users", "bannedAt", LEN_TS, true);
    await ensureIndex("banned_users", "idx_server", "key", ["serverId"]);
    await ensureIndex("banned_users", "idx_user", "key", ["userId"]);
    await ensureIndex("banned_users", "idx_server_user", "unique", [
        "serverId",
        "userId",
    ]);
}

async function setupMutedUsers() {
    await ensureCollection("muted_users", "Muted Users");
    await ensureStringAttribute("muted_users", "serverId", LEN_ID, true);
    await ensureStringAttribute("muted_users", "userId", LEN_ID, true);
    await ensureStringAttribute("muted_users", "mutedBy", LEN_ID, true);
    await ensureStringAttribute("muted_users", "reason", LEN_TEXT, false);
    await ensureStringAttribute("muted_users", "mutedAt", LEN_TS, true);
    await ensureIndex("muted_users", "idx_server", "key", ["serverId"]);
    await ensureIndex("muted_users", "idx_user", "key", ["userId"]);
    await ensureIndex("muted_users", "idx_server_user", "unique", [
        "serverId",
        "userId",
    ]);
}

async function setupFriendships() {
    await ensureCollection("friendships", "Friendships");
    const fields: [string, number, boolean][] = [
        ["requesterId", LEN_ID, true],
        ["recipientId", LEN_ID, true],
        ["pairKey", LEN_ID * 2 + 1, true],
        ["status", 32, true],
        ["requestedAt", LEN_TS, true],
        ["respondedAt", LEN_TS, false],
        ["acceptedAt", LEN_TS, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("friendships", k, size, req);
    }
    await ensureIndex("friendships", "idx_pairKey", "unique", ["pairKey"]);
    await ensureIndex("friendships", "idx_requester", "key", ["requesterId"]);
    await ensureIndex("friendships", "idx_recipient", "key", ["recipientId"]);
    await ensureIndex("friendships", "idx_status", "key", ["status"]);
}

async function setupBlocks() {
    await ensureCollection("blocks", "Blocks");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["blockedUserId", LEN_ID, true],
        ["blockedAt", LEN_TS, true],
        ["reason", LEN_TEXT, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("blocks", k, size, req);
    }
    await ensureIndex("blocks", "idx_user", "key", ["userId"]);
    await ensureIndex("blocks", "idx_blocked_user", "key", ["blockedUserId"]);
    await ensureIndex("blocks", "idx_user_blocked", "unique", [
        "userId",
        "blockedUserId",
    ]);
}

async function setupRoles() {
    await ensureCollection("roles", "Roles");
    const stringFields: [string, number, boolean][] = [
        ["serverId", LEN_ID, true],
        ["name", LEN_ID, true],
        ["color", 16, true],
    ];
    for (const [key, size, required] of stringFields) {
        await ensureStringAttribute("roles", key, size, required);
    }
    await ensureIntegerAttribute("roles", "position", true, 0);
    await ensureIntegerAttribute("roles", "memberCount", false, 0, 0);

    const permissionFlags = [
        "readMessages",
        "sendMessages",
        "manageMessages",
        "manageChannels",
        "manageRoles",
        "manageServer",
        "mentionEveryone",
        "administrator",
        "mentionable",
    ];
    for (const flag of permissionFlags) {
        await ensureBooleanAttribute("roles", flag, true);
    }
    await ensureBooleanAttribute("roles", "defaultOnJoin", false);

    await ensureIndex("roles", "idx_serverId", "key", ["serverId"]);
    await ensureIndex("roles", "idx_position", "key", ["position"]);
}

async function setupRoleAssignments() {
    await ensureCollection("role_assignments", "Role Assignments");
    await ensureStringAttribute("role_assignments", "userId", LEN_ID, true);
    await ensureStringAttribute("role_assignments", "serverId", LEN_ID, true);
    await ensureStringArrayAttribute(
        "role_assignments",
        "roleIds",
        LEN_ID,
        true,
    );

    await ensureIndex("role_assignments", "idx_userId", "key", ["userId"]);
    await ensureIndex("role_assignments", "idx_serverId", "key", ["serverId"]);
    await ensureIndex("role_assignments", "idx_userId_serverId", "key", [
        "userId",
        "serverId",
    ]);
}

async function setupProfiles() {
    await ensureCollection("profiles", "Profiles");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["displayName", 255, false],
        ["bio", 5000, false],
        ["pronouns", 100, false],
        ["avatarFileId", LEN_ID, false],
        ["location", 255, false],
        ["website", 500, false],
        ["profileBackgroundColor", 16, false],
        ["profileBackgroundGradient", 500, false],
        ["profileBackgroundImageFileId", LEN_ID, false],
        ["profileBackgroundImageChangedAt", LEN_TS, false],
        ["avatarFramePreset", 64, false],
        ["dmEncryptionPublicKey", 256, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("profiles", k, size, req);
    }
    await ensureBooleanAttribute("profiles", "showDocsInNavigation", false);
    await ensureBooleanAttribute("profiles", "showFriendsInNavigation", false);
    await ensureBooleanAttribute("profiles", "showSettingsInNavigation", false);
    await ensureBooleanAttribute("profiles", "showAddFriendInHeader", false);
    await ensureBooleanAttribute("profiles", "telemetryEnabled", false);
    await ensureStringAttribute("profiles", "navigationItemOrder", 255, false);
    await ensureIndex("profiles", "idx_userId", "key", ["userId"]);
    try {
        await ensureIndex("profiles", "idx_displayName_search", "fulltext", [
            "displayName",
        ]);
    } catch {
        // optional fulltext search
    }
}

async function setupFeatureFlags() {
    await ensureCollection("feature_flags", "Feature Flags");
    const fields: [string, number, boolean][] = [
        ["key", LEN_ID, true],
        ["description", 500, false],
        ["updatedAt", LEN_TS, false],
        ["updatedBy", LEN_ID, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("feature_flags", k, size, req);
    }
    await ensureBooleanAttribute("feature_flags", "enabled", true);
    await ensureIndex("feature_flags", "idx_key", "key", ["key"]);

    await ensureFeatureFlagDocument({
        description: "Allow members to create their own servers",
        enabled: false,
        key: "allow_user_servers",
    });
    await ensureFeatureFlagDocument({
        description: "Enable audit logging for moderation actions",
        enabled: true,
        key: "enable_audit_logging",
    });
    await ensureFeatureFlagDocument({
        description: "Enable instance-wide system DM announcements",
        enabled: false,
        key: "enable_instance_announcements",
    });
    await ensureFeatureFlagDocument({
        description: "Require email verification before allowing sign in",
        enabled: false,
        key: "enable_email_verification",
    });
    await ensureFeatureFlagDocument({
        description: "Enable built-in GIF and sticker messaging support",
        enabled: false,
        key: "enable_gif_sticker_support",
    });
    await ensureFeatureFlagDocument({
        description: "Enable external GIF search provider",
        enabled: false,
        key: "enable_tenor_gif_search",
    });
}

async function ensureFeatureFlagDocument(params: {
    description: string;
    enabled: boolean;
    key: string;
}) {
    const { description, enabled, key } = params;

    const documentId = createFeatureFlagDocumentId(key);
    const now = new Date().toISOString();
    let operation: "added" | "updated" = "added";

    const deterministicDocument = (await tryVariants([
        () => dbAny.getDocument(DB_ID, "feature_flags", documentId),
        () =>
            dbAny.getDocument?.({
                databaseId: DB_ID,
                collectionId: "feature_flags",
                documentId,
            }),
    ]).catch(() => null)) as {
        $id?: string;
        key?: string;
    } | null;

    if (deterministicDocument?.$id) {
        if (deterministicDocument.key !== key) {
            throw new Error(
                `feature flag '${key}' deterministic document '${documentId}' has mismatched key '${String(deterministicDocument.key)}'`,
            );
        }

        await tryVariants([
            () =>
                dbAny.updateDocument(DB_ID, "feature_flags", documentId, {
                    description,
                    updatedAt: now,
                }),
            () =>
                dbAny.updateDocument?.({
                    data: {
                        description,
                        updatedAt: now,
                    },
                    databaseId: DB_ID,
                    collectionId: "feature_flags",
                    documentId,
                }),
        ]);
        info(`[setup] updated feature flag '${key}'`);
        return;
    }

    const existingByKey = (await tryVariants([
        () =>
            dbAny.listDocuments(DB_ID, "feature_flags", [
                Query.equal("key", key),
                Query.limit(1),
            ]),
        () =>
            dbAny.listDocuments?.({
                databaseId: DB_ID,
                collectionId: "feature_flags",
                queries: [Query.equal("key", key), Query.limit(1)],
            }),
    ]).catch(() => ({ documents: [] }))) as {
        documents?: Array<{ $id?: string }>;
    };

    const legacyDocumentId = existingByKey.documents?.[0]?.$id;
    if (legacyDocumentId && legacyDocumentId !== documentId) {
        warn(
            `[setup] legacy duplicate detected for feature flag '${key}' (legacy id: ${legacyDocumentId}, deterministic id: ${documentId})`,
        );
    }

    await tryVariants([
        () =>
            dbAny.createDocument(DB_ID, "feature_flags", documentId, {
                description,
                enabled,
                key,
                updatedAt: now,
            }),
        () =>
            dbAny.createDocument?.({
                data: {
                    description,
                    enabled,
                    key,
                    updatedAt: now,
                },
                databaseId: DB_ID,
                collectionId: "feature_flags",
                documentId,
            }),
    ]).catch(async (error) => {
        if (!isDuplicateConflictError(error)) {
            throw error;
        }
        operation = "updated";

        // Another setup run may have created this deterministic document concurrently.
        const latestDocument = (await tryVariants([
            () => dbAny.getDocument(DB_ID, "feature_flags", documentId),
            () =>
                dbAny.getDocument?.({
                    databaseId: DB_ID,
                    collectionId: "feature_flags",
                    documentId,
                }),
        ]).catch((getError: unknown) => {
            throw new Error(
                `feature flag '${key}' create conflicted but deterministic document '${documentId}' could not be loaded: ${
                    getError instanceof Error
                        ? getError.message
                        : String(getError)
                }`,
            );
        })) as {
            $id?: string;
            key?: string;
        };

        if (!latestDocument.$id) {
            throw new Error(
                `feature flag '${key}' create conflicted but deterministic document '${documentId}' was not found`,
            );
        }

        if (latestDocument.key !== key) {
            throw new Error(
                `feature flag '${key}' deterministic document '${documentId}' has mismatched key '${String(latestDocument.key)}'`,
            );
        }

        await tryVariants([
            () =>
                dbAny.updateDocument(DB_ID, "feature_flags", documentId, {
                    description,
                    updatedAt: now,
                }),
            () =>
                dbAny.updateDocument?.({
                    data: {
                        description,
                        updatedAt: now,
                    },
                    databaseId: DB_ID,
                    collectionId: "feature_flags",
                    documentId,
                }),
        ]);
    });
    info(`[setup] ${operation} feature flag '${key}'`);
}

async function setupInvites() {
    await ensureCollection("invites", "Server Invites");
    const fields: [string, number, boolean][] = [
        ["serverId", LEN_ID, true],
        ["code", LEN_ID, true],
        ["creatorId", LEN_ID, true],
        ["channelId", LEN_ID, false],
        ["expiresAt", LEN_TS, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("invites", k, size, req);
    }
    await ensureIntegerAttribute("invites", "maxUses", false);
    await ensureIntegerAttribute("invites", "currentUses", true);
    await ensureBooleanAttribute("invites", "temporary", true);
    // Indexes
    await ensureIndex("invites", "idx_code", "unique", ["code"]);
    await ensureIndex("invites", "idx_server", "key", ["serverId"]);
    await ensureIndex("invites", "idx_creator", "key", ["creatorId"]);
}

async function setupInviteUsage() {
    await ensureCollection("invite_usage", "Invite Usage");
    const fields: [string, number, boolean][] = [
        ["inviteCode", LEN_ID, true],
        ["userId", LEN_ID, true],
        ["serverId", LEN_ID, true],
        ["joinedAt", LEN_TS, true],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("invite_usage", k, size, req);
    }
    await ensureIndex("invite_usage", "idx_code", "key", ["inviteCode"]);
    await ensureIndex("invite_usage", "idx_user", "key", ["userId"]);
    await ensureIndex("invite_usage", "idx_server", "key", ["serverId"]);
}

async function setupStatuses() {
    await ensureCollection("statuses", "Statuses");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["status", 64, true],
        ["customMessage", LEN_TEXT, false],
        ["lastSeenAt", LEN_TS, true],
        ["expiresAt", LEN_TS, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("statuses", k, size, req);
    }
    await ensureBooleanAttribute("statuses", "isManuallySet", false);
    await ensureIndex("statuses", "idx_userId", "key", ["userId"]);
    await ensureIndex("statuses", "idx_status", "key", ["status"]);
}

async function setupConversations() {
    await ensureCollection("conversations", "Conversations");
    await ensureStringArrayAttribute(
        "conversations",
        "participants",
        LEN_ID,
        true,
    );
    await ensureStringAttribute(
        "conversations",
        "lastMessageAt",
        LEN_TS,
        false,
    );
    await ensureBooleanAttribute("conversations", "isGroup", false);
    await ensureBooleanAttribute(
        "conversations",
        "isSystemAnnouncementThread",
        false,
    );
    await ensureStringAttribute("conversations", "name", LEN_ID, false);
    await ensureStringAttribute("conversations", "avatarUrl", 2000, false);
    await ensureStringAttribute("conversations", "createdBy", LEN_ID, false);
    await ensureStringAttribute(
        "conversations",
        "readOnlyReason",
        LEN_TEXT,
        false,
    );
    await ensureStringAttribute(
        "conversations",
        "announcementThreadKey",
        LEN_ID,
        false,
    );
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("conversations", "idx_participants", "key", [
        "participants",
    ]);
    await ensureIndex("conversations", "idx_announcement_thread", "unique", [
        "isSystemAnnouncementThread",
        "announcementThreadKey",
    ], { recreateIfMismatched: true });
}

async function setupDirectMessages() {
    await ensureCollection("direct_messages", "Direct Messages");
    const fields: [string, number, boolean][] = [
        ["conversationId", LEN_ID, true],
        ["senderId", LEN_ID, true],
        ["receiverId", LEN_ID, false],
        ["text", LEN_TEXT, false], // Changed to false - text is optional if image is present
        ["editedAt", LEN_TS, false],
        ["removedAt", LEN_TS, false],
        ["replyToId", LEN_ID, false],
        ["threadId", LEN_ID, false],
        ["lastThreadReplyAt", LEN_TS, false],
        ["imageFileId", LEN_ID, false],
        ["imageUrl", 2000, false],
        ["reactions", 2000, false], // JSON string of reactions array (reduced size to fit limit)
        ["encryptedText", LEN_TEXT_LARGE, false],
        ["encryptionNonce", 128, false],
        ["encryptionVersion", 64, false],
        ["encryptionSenderPublicKey", 256, false],
        ["announcementId", LEN_ID, false],
        ["priorityTag", 32, false],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("direct_messages", k, size, req);
    }
    await ensureBooleanAttribute("direct_messages", "isEncrypted", false);
    await ensureBooleanAttribute(
        "direct_messages",
        "isSystemAnnouncement",
        false,
    );
    await ensureStringArrayAttribute(
        "direct_messages",
        "mentions",
        LEN_ID,
        false,
    );
    await ensureIntegerAttribute(
        "direct_messages",
        "threadMessageCount",
        false,
        0,
    );
    await ensureStringArrayAttribute(
        "direct_messages",
        "threadParticipants",
        LEN_ID,
        false,
    );
    // Note: Using system $createdAt attribute for ordering, no custom attribute needed
    await ensureIndex("direct_messages", "idx_conversation", "key", [
        "conversationId",
    ]);
    await ensureIndex("direct_messages", "idx_sender", "key", ["senderId"]);
    await ensureIndex("direct_messages", "idx_receiver", "key", ["receiverId"]);
    await ensureIndex("direct_messages", "idx_threadId", "key", ["threadId"]);
    await ensureIndex("direct_messages", "idx_announcement", "key", [
        "announcementId",
    ]);
    await ensureIndex("direct_messages", "idx_text_search", "fulltext", [
        "text",
    ]);
}

async function setupAnnouncements() {
    await ensureCollection(ANNOUNCEMENTS_COLLECTION_ID, "Announcements");
    const fields: [string, number, boolean][] = [
        ["title", 255, false],
        ["body", LEN_TEXT_LARGE, true],
        ["bodyFormat", 32, true],
        ["status", 32, true],
        ["priority", 32, true],
        ["createdBy", LEN_ID, true],
        ["publishedAt", LEN_TS, false],
        ["scheduledFor", LEN_TS, false],
        ["lastDispatchAt", LEN_TS, false],
        ["recipientScope", 64, true],
        ["idempotencyKey", LEN_ID, false],
        ["urgentBypass", LEN_TEXT, false],
        ["deliverySummary", LEN_TEXT, false],
    ];
    for (const [key, size, required] of fields) {
        await ensureStringAttribute(
            ANNOUNCEMENTS_COLLECTION_ID,
            key,
            size,
            required,
        );
    }
    await ensureIntegerAttribute(
        ANNOUNCEMENTS_COLLECTION_ID,
        "dispatchAttempts",
        false,
        0,
    );
    await backfillAnnouncementIdempotencyKeys();

    // Before creating unique index, check for duplicates
    await ensureNoDuplicateIdempotencyKeys();

    await ensureIndex(
        ANNOUNCEMENTS_COLLECTION_ID,
        "idx_status_scheduled",
        "key",
        ["status", "scheduledFor"],
    );
    await ensureIndex(ANNOUNCEMENTS_COLLECTION_ID, "idx_createdBy", "key", [
        "createdBy",
    ]);
    await ensureIndex(
        ANNOUNCEMENTS_COLLECTION_ID,
        "idx_idempotency",
        "unique",
        ["createdBy", "idempotencyKey"],
        { recreateIfMismatched: true },
    );
}

async function setupAnnouncementDeliveries() {
    await ensureCollection(
        ANNOUNCEMENT_DELIVERIES_COLLECTION_ID,
        "Announcement Deliveries",
    );
    const fields: [string, number, boolean][] = [
        ["announcementId", LEN_ID, true],
        ["recipientUserId", LEN_ID, true],
        ["status", 32, true],
        ["conversationId", LEN_ID, false],
        ["messageId", LEN_ID, false],
        ["nextAttemptAt", LEN_TS, false],
        ["deliveredAt", LEN_TS, false],
        ["failedAt", LEN_TS, false],
        ["failureReason", LEN_TEXT, false],
    ];
    for (const [key, size, required] of fields) {
        await ensureStringAttribute(
            ANNOUNCEMENT_DELIVERIES_COLLECTION_ID,
            key,
            size,
            required,
        );
    }
    await ensureIntegerAttribute(
        ANNOUNCEMENT_DELIVERIES_COLLECTION_ID,
        "attemptCount",
        false,
        0,
    );
    await ensureIndex(
        ANNOUNCEMENT_DELIVERIES_COLLECTION_ID,
        "idx_announcement_user",
        "unique",
        ["announcementId", "recipientUserId"],
    );
    await ensureIndex(
        ANNOUNCEMENT_DELIVERIES_COLLECTION_ID,
        "idx_status_nextAttempt",
        "key",
        ["status", "nextAttemptAt"],
    );
}

async function setupPinnedMessages() {
    await ensureCollection("pinned_messages", "Pinned Messages");
    const fields: [string, number, boolean][] = [
        ["messageId", LEN_ID, true],
        ["contextType", 32, true],
        ["contextId", LEN_ID, true],
        ["pinnedBy", LEN_ID, true],
        ["pinnedAt", LEN_TS, true],
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("pinned_messages", k, size, req);
    }

    await ensureIndex("pinned_messages", "idx_context", "key", [
        "contextType",
        "contextId",
    ]);
    try {
        await ensureIndex("pinned_messages", "idx_pinnedAt", "key", [
            "pinnedAt",
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warn(
            `[setup] skipping pinned_messages.idx_pinnedAt due to backend propagation issue: ${message}`,
        );
    }
    await ensureIndex("pinned_messages", "idx_context_message", "unique", [
        "contextType",
        "contextId",
        "messageId",
    ]);
}

async function setupPolls() {
    await ensureCollection("polls", "Polls");
    const fields: [string, number, boolean][] = [
        ["messageId", LEN_ID, true],
        ["channelId", LEN_ID, true],
        ["question", LEN_TEXT, true],
        ["options", LEN_TEXT, true],
        ["status", 32, true],
        ["createdBy", LEN_ID, true],
        ["closedAt", LEN_TS, false],
        ["closedBy", LEN_ID, false],
    ];
    for (const [key, size, required] of fields) {
        await ensureStringAttribute("polls", key, size, required);
    }
    await ensureIndex("polls", "idx_message", "unique", ["messageId"]);
    await ensureIndex("polls", "idx_channel", "key", ["channelId"]);
    await ensureIndex("polls", "idx_status", "key", ["status"]);
}

async function setupPollVotes() {
    await ensureCollection("poll_votes", "Poll Votes");
    const fields: [string, number, boolean][] = [
        ["pollId", LEN_ID, true],
        ["userId", LEN_ID, true],
        ["optionId", LEN_ID, true],
        ["votedAt", LEN_TS, true],
    ];
    for (const [key, size, required] of fields) {
        await ensureStringAttribute("poll_votes", key, size, required);
    }
    await ensureIndex("poll_votes", "idx_poll", "key", ["pollId"]);
    await ensureIndex("poll_votes", "idx_user", "key", ["userId"]);
    await ensureIndex("poll_votes", "idx_poll_user", "unique", [
        "pollId",
        "userId",
    ]);
}

async function setupNotificationSettings() {
    await ensureCollection("notification_settings", "Notification Settings");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["globalNotifications", 32, true], // "all" | "mentions" | "nothing"
        ["directMessagePrivacy", 32, true], // "everyone" | "friends"
        ["quietHoursStart", 8, false], // HH:mm format
        ["quietHoursEnd", 8, false], // HH:mm format
        ["quietHoursTimezone", 64, false], // IANA timezone
        ["serverOverrides", LEN_TEXT, false], // JSON string of Record<serverId, NotificationOverride>
        ["channelOverrides", LEN_TEXT, false], // JSON string of Record<channelId, NotificationOverride>
        ["conversationOverrides", LEN_TEXT, false], // JSON string of Record<conversationId, NotificationOverride>
    ];
    for (const [k, size, req] of fields) {
        await ensureStringAttribute("notification_settings", k, size, req);
    }
    await ensureBooleanAttribute(
        "notification_settings",
        "desktopNotifications",
        true,
    );
    await ensureBooleanAttribute(
        "notification_settings",
        "dmEncryptionEnabled",
        false,
    );
    await ensureBooleanAttribute(
        "notification_settings",
        "pushNotifications",
        true,
    );
    await ensureBooleanAttribute(
        "notification_settings",
        "notificationSound",
        true,
    );
    await ensureIndex("notification_settings", "idx_userId", "unique", [
        "userId",
    ]);
}

async function setupThreadReads() {
    await ensureCollection("thread_reads", "Thread Reads");
    await ensureStringAttribute("thread_reads", "userId", LEN_ID, true);
    await ensureStringAttribute("thread_reads", "contextType", 32, true);
    await ensureStringAttribute("thread_reads", "contextId", LEN_ID, true);
    // setupThreadReads: `thread_reads.reads` stores a JSON map and is capped at ~65KB;
    // at typical ISO timestamp payload sizes this supports roughly ~1000 thread ids per context.
    await ensureStringAttribute("thread_reads", "reads", LEN_TEXT_LARGE, true);
    await waitForAttribute("thread_reads", "reads");

    const readsAttribute = (await tryVariants([
        () => dbAny.getAttribute(DB_ID, "thread_reads", "reads"),
        () =>
            dbAny.getAttribute?.({
                databaseId: DB_ID,
                collectionId: "thread_reads",
                key: "reads",
            }),
    ])) as {
        required?: boolean;
        size?: number | string;
    };
    const configuredSize = Number(readsAttribute.size ?? 0);
    const readsRequired = Boolean(readsAttribute.required);

    if (
        (Number.isFinite(configuredSize) && configuredSize < LEN_TEXT_LARGE) ||
        !readsRequired
    ) {
        try {
            await updateStringAttributeSize(
                "thread_reads",
                "reads",
                LEN_TEXT_LARGE,
                true,
            );
            await waitForAttribute("thread_reads", "reads");
            info("[setup] migrated thread_reads.reads to large text size");
        } catch (migrationError) {
            throw new Error(
                `thread_reads.reads schema mismatch (size=${configuredSize}, required=${readsRequired}). Expected size=${LEN_TEXT_LARGE} and required=true. Run a manual schema migration before setup can continue. ${
                    migrationError instanceof Error
                        ? migrationError.message
                        : String(migrationError)
                }`,
            );
        }
    }

    await ensureIndex("thread_reads", "idx_user_context", "unique", [
        "userId",
        "contextType",
        "contextId",
    ]);
}

async function setupInboxItems() {
    await ensureCollection("inbox_items", "Inbox Items");
    const fields: [string, number, boolean][] = [
        ["userId", LEN_ID, true],
        ["kind", 32, true],
        ["contextKind", 32, true],
        ["contextId", LEN_ID, true],
        ["serverId", LEN_ID, false],
        ["messageId", LEN_ID, true],
        ["parentMessageId", LEN_ID, false],
        ["latestActivityAt", LEN_TS, true],
        ["previewText", LEN_TEXT, false],
        ["authorUserId", LEN_ID, true],
        ["readAt", LEN_TS, false],
    ];
    for (const [key, size, required] of fields) {
        await ensureStringAttribute("inbox_items", key, size, required);
    }
    await ensureIndex("inbox_items", "idx_user_kind", "key", [
        "userId",
        "kind",
    ]);
    await ensureIndex("inbox_items", "idx_user_activity", "key", [
        "userId",
        "latestActivityAt",
    ]);
    await ensureIndex("inbox_items", "idx_user_item", "unique", [
        "userId",
        "kind",
        "contextKind",
        "contextId",
        "messageId",
    ]);
}

async function ensureBucket(
    id: string,
    name: string,
    maxFileSize = 2097152,
    allowedExtensions = ["jpg", "jpeg", "png", "gif", "webp"],
) {
    try {
        await tryVariants([
            () => storageAny.getBucket(id),
            () => storageAny.getBucket?.({ bucketId: id }),
        ]);
    } catch {
        await tryVariants([
            () =>
                storageAny.createBucket(
                    id,
                    name,
                    [], // permissions - we'll set file-level permissions
                    false, // fileSecurity (document-level perms)
                    true, // enabled
                    maxFileSize, // max file size
                    allowedExtensions, // allowed extensions
                ),
            () =>
                storageAny.createBucket?.({
                    bucketId: id,
                    name,
                    permissions: [],
                    fileSecurity: false,
                    enabled: true,
                    maximumFileSize: maxFileSize,
                    allowedFileExtensions: allowedExtensions,
                }),
        ]);
        info(`[setup] created bucket '${id}'`);
    }
}

async function setupStorage() {
    await ensureBucket("avatars", "User Avatars", 2097152, [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
    ]); // 2MB for avatars
    await ensureBucket("images", "Chat Images", 5242880, [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
    ]); // 5MB for chat images
    await ensureBucket("emojis", "Custom Emojis", 10485760, [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
    ]); // 10MB for custom emojis
    await ensureBucket("profile-backgrounds", "Profile Backgrounds", 5242880, [
        "jpg",
        "jpeg",
        "png",
        "webp",
    ]); // 5MB for profile backgrounds
    await ensureBucket(
        "avatar-frames-predefined",
        "Avatar Frames Predefined",
        1048576,
        ["png"],
    ); // 1MB for predefined avatar frame PNGs
    await ensureBucket(
        GIFS_BUCKET_ID,
        "GIF Assets",
        5242880,
        ["gif", "webp", "mp4"],
    ); // 5MB for curated/imported GIF assets
    await ensureBucket(
        STICKERS_BUCKET_ID,
        "Sticker Assets",
        2097152,
        ["png", "webp", "gif"],
    ); // 2MB for sticker assets
    // Files bucket for various file types (documents, videos, audio, archives, code)
    await ensureBucket(
        "files",
        "File Attachments",
        52428800, // 50MB max
        [
            // Documents
            "pdf",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            "txt",
            // Videos
            "mp4",
            "webm",
            "mov",
            "avi",
            "mkv",
            // Audio
            "mp3",
            "wav",
            "ogg",
            "m4a",
            "flac",
            // Archives
            "zip",
            "rar",
            "7z",
            "tar",
            "gz",
            // Code files
            "js",
            "ts",
            "jsx",
            "tsx",
            "py",
            "java",
            "c",
            "cpp",
            "h",
            "css",
            "html",
            "json",
            "xml",
            "yaml",
            "yml",
            "md",
            // Other common formats
            "csv",
            "svg",
            "ico",
        ],
    );
}

async function ensureTeams() {
    if (skipTeams) {
        info("[setup] skipping teams (SKIP_TEAMS set)");
        return;
    }
    const defs: Array<{ id: string; label: string }> = [
        { id: "team_admins", label: "Admins" },
        { id: "team_mods", label: "Moderators" },
    ];
    for (const { id, label } of defs) {
        try {
            await teams.get(id);
            continue; // exists
        } catch (e) {
            const msg = (e as Error).message || "";
            if (msg.includes("missing scopes") && msg.includes("teams.write")) {
                warn(
                    `missing teams.write scope – cannot create ${id}; re-run with teams.write scope or set SKIP_TEAMS=1`,
                );
                continue;
            }
        }
        try {
            await teams.create(id, label);
            info(`[setup] created team ${id}`);
        } catch (ce) {
            warn(`[setup] failed creating ${id}: ${(ce as Error).message}`);
        }
    }
}

// ---- Preflight scope diagnostics ----
async function preflight() {
    const failures: string[] = [];
    // Databases read capability
    try {
        await tryVariants([
            () => dbAny.get(DB_ID),
            () => dbAny.getDatabase?.(DB_ID),
            () => dbAny.getDatabase?.({ databaseId: DB_ID }),
        ]);
    } catch (e) {
        const msg = (e as Error).message || "";
        if (msg.includes("missing scopes")) {
            failures.push("databases.read");
        }
    }
    // Teams read capability (optional if skipping teams)
    if (!skipTeams) {
        try {
            await teams.list();
        } catch (e) {
            const msg = (e as Error).message || "";
            if (msg.includes("missing scopes")) {
                failures.push("teams.read");
            }
        }
    }
    if (failures.length) {
        warn(
            `Potential missing scopes detected: ${failures.join(", ")}. If this script fails later, create a new API key with: databases.read, databases.write, collections.read, collections.write, attributes.read, attributes.write, indexes.read, indexes.write${
                skipTeams ? "" : ", teams.read, teams.write"
            }.`,
        );
    }
}

async function run() {
    writeStdout(
        colorize(`${ANSI.bold}Firepit Appwrite Setup${ANSI.reset}`, ANSI.cyan),
    );
    writeStdout(
        `${colorize("[env]", ANSI.dim)} endpoint=${endpoint} project=${project} database=${DB_ID}`,
    );
    if (skipTeams) {
        writeStdout(
            `${colorize("[env]", ANSI.dim)} teams=skipped (SKIP_TEAMS set)`,
        );
    }

    await preflight();
    await ensureDatabase();
    info("[setup] Setting up storage...");
    await setupStorage();
    info("[setup] Setting up servers...");
    await setupServers();
    info("[setup] Setting up channels...");
    await setupChannels();
    await setupCategories();
    info("[setup] Setting up messages...");
    await setupMessages();
    info("[setup] Setting up message attachments...");
    await setupMessageAttachments();
    info("[setup] Setting up audit...");
    await setupAudit();
    info("[setup] Setting up reports...");
    await setupReports();
    info("[setup] Setting up typing...");
    try {
        await setupTyping();
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        err(`[setup] Failed to setup typing (non-fatal): ${message}`);
    }
    info("[setup] Setting up memberships...");
    await setupMemberships();
    info("[setup] Setting up friendships...");
    await setupFriendships();
    info("[setup] Setting up blocks...");
    await setupBlocks();
    info("[setup] Setting up banned users...");
    await setupBannedUsers();
    info("[setup] Setting up muted users...");
    await setupMutedUsers();
    info("[setup] Setting up roles...");
    await setupRoles();
    info("[setup] Setting up role assignments...");
    await setupRoleAssignments();
    info("[setup] Setting up profiles...");
    await setupProfiles();
    info("[setup] Setting up feature flags...");
    await setupFeatureFlags();
    info("[setup] Setting up announcements...");
    await setupAnnouncements();
    info("[setup] Setting up announcement deliveries...");
    await setupAnnouncementDeliveries();
    info("[setup] Setting up invites...");
    await setupInvites();
    info("[setup] Setting up invite usage...");
    await setupInviteUsage();
    info("[setup] Setting up statuses...");
    await setupStatuses();
    info("[setup] Setting up conversations...");
    await setupConversations();
    info("[setup] Setting up direct messages...");
    await setupDirectMessages();
    info("[setup] Setting up pinned messages...");
    await setupPinnedMessages();
    info("[setup] Setting up polls...");
    await setupPolls();
    info("[setup] Setting up poll votes...");
    await setupPollVotes();
    info("[setup] Setting up notification settings...");
    await setupNotificationSettings();
    info("[setup] Setting up inbox items...");
    await setupInboxItems();
    info("[setup] Setting up thread reads...");
    await setupThreadReads();
    info("[setup] Setting up teams...");
    await ensureTeams();
    writeStdout();
    writeStdout(`${colorize("[done]", ANSI.green)} Setup complete.`);
    logSummary();
}

run().catch((e) => {
    err(String(e instanceof Error ? e.message : e));
    process.exit(1);
});
