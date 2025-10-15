/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Idempotent Appwrite bootstrap script.
 * Creates database, collections, string attributes, indexes, teams, and storage buckets if they do not exist.
 * Safe to re-run. Avoids console.* per project lint rules (writes directly to stdout/stderr).
 */
import { Client, Databases, Storage, Teams } from "node-appwrite";

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
const LEN_ID = 128;
const LEN_TS = 64; // ISO / epoch string length allowance
const LEN_TEXT = 4000; // generous message / meta text length

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

function info(msg: string) {
	process.stdout.write(`${msg}\n`);
}
function warn(msg: string) {
	process.stderr.write(`[warn] ${msg}\n`);
}
function err(msg: string) {
	process.stderr.write(`[error] ${msg}\n`);
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
			() => dbAny.getCollection?.({ databaseId: DB_ID, collectionId: id }),
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
		info(`[setup] created collection '${id}' with document-level security enabled`);
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
			() => dbAny.createStringAttribute(DB_ID, collection, key, size, required),
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
			() => dbAny.createBooleanAttribute(DB_ID, collection, key, required),
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

type IndexType = "key" | "fulltext"; // subset used
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

async function ensureIndex(
	collection: string,
	name: string,
	type: IndexType,
	attributes: string[],
) {
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
		info(`[setup] index ${collection}.${name} already exists (status: ${String((existing as any).status)})`);
	} catch {
		// Wait for all attributes to be available before creating index
		for (const attr of attributes) {
			await waitForAttribute(collection, attr);
		}

		// Retry index creation with backoff if attributes aren't ready
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
					() => dbAny.createIndex(DB_ID, collection, name, type, attributes),
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
				return; // Success!
			} catch (e) {
				lastError = e as Error;
				const errMsg = lastError.message || "";
				// If it's an "attribute not available" error, retry
				if (errMsg.includes("Attribute not available")) {
					continue;
				}
				// For other errors, handle immediately
				if (type === "fulltext") {
					warn(
						`skipping fulltext index ${collection}.${name}: ${lastError.message}`,
					);
					return;
				}
				// Re-throw other errors
				throw e;
			}
		}

		// All retries failed
		if (type === "fulltext") {
			warn(
				`skipping fulltext index ${collection}.${name}: ${lastError?.message ?? "unknown error"}`,
			);
		} else {
			throw lastError ?? new Error("Failed to create index after retries");
		}
	}
}

// ---- Domain Specific Setup ----
async function setupServers() {
	await ensureCollection("servers", "Servers");
	await ensureStringAttribute("servers", "name", LEN_ID, true);
	await ensureStringAttribute("servers", "ownerId", LEN_ID, true);
	// Note: Using system $createdAt attribute for ordering, no custom attribute needed
}

async function setupChannels() {
	await ensureCollection("channels", "Channels");
	await ensureStringAttribute("channels", "serverId", LEN_ID, true);
	await ensureStringAttribute("channels", "name", LEN_ID, true);
	// Note: Using system $createdAt attribute for ordering, no custom attribute needed
	await ensureIndex("channels", "idx_serverId", "key", ["serverId"]);
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
	];
	for (const [k, size, req] of fields) {
		await ensureStringAttribute("messages", k, size, req);
	}
	// Note: Using system $createdAt attribute for ordering, no custom attribute needed
	await ensureIndex("messages", "idx_userId", "key", ["userId"]);
	await ensureIndex("messages", "idx_channelId", "key", ["channelId"]);
	await ensureIndex("messages", "idx_serverId", "key", ["serverId"]);
	await ensureIndex("messages", "idx_removedAt", "key", ["removedAt"]);
	
	try {
		await ensureIndex("messages", "idx_text_search", "fulltext", ["text"]);
	} catch {
		// optional
	}
}

async function setupAudit() {
	await ensureCollection("audit", "Audit");
	const fields: [string, number, boolean][] = [
		["action", LEN_ID, true],
		["targetId", LEN_ID, true],
		["actorId", LEN_ID, true],
		["meta", LEN_TEXT, false],
	];
	for (const [k, size, req] of fields) {
		await ensureStringAttribute("audit", k, size, req);
	}
	// Note: Using system $createdAt attribute for ordering, no custom attribute needed
	await ensureIndex("audit", "idx_action", "key", ["action"]);
	await ensureIndex("audit", "idx_actor", "key", ["actorId"]);
	await ensureIndex("audit", "idx_target", "key", ["targetId"]);
}

async function setupTyping() {
	await ensureCollection("typing", "Typing");
	const fields: [string, number, boolean][] = [
		["userId", LEN_ID, true],
		["userName", LEN_ID, false],
		["channelId", LEN_ID, true],
		["updatedAt", LEN_TS, true],
	];
	for (const [k, size, req] of fields) {
		await ensureStringAttribute("typing", k, size, req);
	}
	await ensureIndex("typing", "idx_channel", "key", ["channelId"]);
	await ensureIndex("typing", "idx_updated", "key", ["updatedAt"]);
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
	];
	for (const [k, size, req] of fields) {
		await ensureStringAttribute("profiles", k, size, req);
	}
	await ensureIndex("profiles", "idx_userId", "key", ["userId"]);
	try {
		await ensureIndex("profiles", "idx_displayName_search", "fulltext", [
			"displayName",
		]);
	} catch {
		// optional fulltext search
	}
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

async function ensureBucket(id: string, name: string) {
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
					2097152, // max file size: 2MB
					["jpg", "jpeg", "png", "gif", "webp"], // allowed extensions
				),
			() =>
				storageAny.createBucket?.({
					bucketId: id,
					name,
					permissions: [],
					fileSecurity: false,
					enabled: true,
					maximumFileSize: 2097152,
					allowedFileExtensions: ["jpg", "jpeg", "png", "gif", "webp"],
				}),
		]);
		info(`[setup] created bucket '${id}'`);
	}
}

async function setupStorage() {
	await ensureBucket("avatars", "User Avatars");
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
	await preflight();
	await ensureDatabase();
	info("[setup] Setting up servers...");
	await setupServers();
	info("[setup] Setting up channels...");
	await setupChannels();
	info("[setup] Setting up messages...");
	await setupMessages();
	info("[setup] Setting up audit...");
	await setupAudit();
	info("[setup] Setting up typing...");
	await setupTyping();
	info("[setup] Setting up memberships...");
	await setupMemberships();
	info("[setup] Setting up profiles...");
	await setupProfiles();
	info("[setup] Setting up statuses...");
	await setupStatuses();
	info("[setup] Setting up storage...");
	await setupStorage();
	info("[setup] Setting up teams...");
	await ensureTeams();
	info("Setup complete.");
}

run().catch((e) => {
	err(String(e instanceof Error ? e.message : e));
	process.exit(1);
});
