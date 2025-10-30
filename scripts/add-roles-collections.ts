/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Add roles and permissions collections to Appwrite database.
 * Creates:
 * - roles: Server-specific roles with permissions
 * - role_assignments: User-to-role mappings per server
 * - channel_permission_overrides: Channel-specific permission overrides
 */
import { Client, Databases } from "node-appwrite";

// ---- Environment ----
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

// ---- Constants ----
const DB_ID = "main";
const LEN_ID = 128;
const LEN_NAME = 100;
const LEN_COLOR = 20;

// ---- Client ----
const client = new Client().setEndpoint(endpoint).setProject(project);
if (
	typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
	"function"
) {
	(client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);
const dbAny = databases as any;

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

// ---- Ensure collection ----
async function ensureCollection(id: string, name: string) {
	try {
		await tryVariants([
			() => dbAny.getCollection(DB_ID, id),
			() => dbAny.getCollection?.({ databaseId: DB_ID, collectionId: id }),
		]);
		info(`[roles] collection '${id}' already exists`);
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
		info(`[roles] created collection '${id}'`);
	}
}

// ---- Ensure attributes ----
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
		info(`[roles] added ${collection}.${key}`);
	}
}

async function ensureBooleanAttribute(
	collection: string,
	key: string,
	required: boolean,
	defaultValue?: boolean,
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
			() => dbAny.createBooleanAttribute(DB_ID, collection, key, required, defaultValue),
			() =>
				dbAny.createBooleanAttribute?.({
					databaseId: DB_ID,
					collectionId: collection,
					key,
					required,
					default: defaultValue,
				}),
		]);
		info(`[roles] added ${collection}.${key} (boolean)`);
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
			() => dbAny.createIntegerAttribute(DB_ID, collection, key, required, min, max, defaultValue),
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
		info(`[roles] added ${collection}.${key} (integer)`);
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
			() => dbAny.createStringAttribute(DB_ID, collection, key, size, required, undefined, true),
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
		info(`[roles] added ${collection}.${key} (string array)`);
	}
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
			if ((attr as any).status === "available") {
				return;
			}
		} catch {
			// Attribute doesn't exist yet
		}
		await new Promise((res) => setTimeout(res, delayMs));
	}
	throw new Error(`Attribute ${collection}.${key} did not become available`);
}

async function ensureIndex(
	collection: string,
	key: string,
	type: "key" | "fulltext",
	attributes: string[],
) {
	try {
		await tryVariants([
			() => dbAny.getIndex(DB_ID, collection, key),
			() =>
				dbAny.getIndex?.({ databaseId: DB_ID, collectionId: collection, key }),
		]);
	} catch {
		await tryVariants([
			() => dbAny.createIndex(DB_ID, collection, key, type, attributes),
			() =>
				dbAny.createIndex?.({
					databaseId: DB_ID,
					collectionId: collection,
					key,
					type,
					attributes,
				}),
		]);
		info(`[roles] created index ${collection}.${key} (${type})`);
	}
}

// ---- Main setup ----
async function main() {
	info("[roles] Starting roles & permissions setup...");

	// 1. Create roles collection
	await ensureCollection("roles", "Roles");
	await ensureStringAttribute("roles", "serverId", LEN_ID, true);
	await ensureStringAttribute("roles", "name", LEN_NAME, true);
	await ensureStringAttribute("roles", "color", LEN_COLOR, true);
	await ensureIntegerAttribute("roles", "position", true, 0, 0, 999);
	
	// Permission flags
	await ensureBooleanAttribute("roles", "readMessages", true, true);
	await ensureBooleanAttribute("roles", "sendMessages", true, true);
	await ensureBooleanAttribute("roles", "manageMessages", true, false);
	await ensureBooleanAttribute("roles", "manageChannels", true, false);
	await ensureBooleanAttribute("roles", "manageRoles", true, false);
	await ensureBooleanAttribute("roles", "manageServer", true, false);
	await ensureBooleanAttribute("roles", "mentionEveryone", true, false);
	await ensureBooleanAttribute("roles", "administrator", true, false);
	
	await ensureBooleanAttribute("roles", "mentionable", true, true);
	await ensureIntegerAttribute("roles", "memberCount", false, 0, 0);

	// Wait for attributes to be available before creating indexes
	info("[roles] Waiting for role attributes to be available...");
	await waitForAttribute("roles", "serverId");
	await waitForAttribute("roles", "position");

	// Create indexes
	await ensureIndex("roles", "serverId_idx", "key", ["serverId"]);
	await ensureIndex("roles", "position_idx", "key", ["position"]);

	info("[roles] Roles collection setup complete");

	// 2. Create role_assignments collection
	await ensureCollection("role_assignments", "Role Assignments");
	await ensureStringAttribute("role_assignments", "userId", LEN_ID, true);
	await ensureStringAttribute("role_assignments", "serverId", LEN_ID, true);
	await ensureStringArrayAttribute("role_assignments", "roleIds", LEN_ID, true);

	info("[roles] Waiting for role assignment attributes...");
	await waitForAttribute("role_assignments", "userId");
	await waitForAttribute("role_assignments", "serverId");

	// Create indexes for efficient queries
	await ensureIndex("role_assignments", "userId_idx", "key", ["userId"]);
	await ensureIndex("role_assignments", "serverId_idx", "key", ["serverId"]);
	await ensureIndex("role_assignments", "userId_serverId_idx", "key", ["userId", "serverId"]);

	info("[roles] Role assignments collection setup complete");

	// 3. Create channel_permission_overrides collection
	await ensureCollection("channel_permission_overrides", "Channel Permission Overrides");
	await ensureStringAttribute("channel_permission_overrides", "channelId", LEN_ID, true);
	await ensureStringAttribute("channel_permission_overrides", "roleId", LEN_ID, false);
	await ensureStringAttribute("channel_permission_overrides", "userId", LEN_ID, false);
	await ensureStringArrayAttribute("channel_permission_overrides", "allow", 50, true);
	await ensureStringArrayAttribute("channel_permission_overrides", "deny", 50, true);

	info("[roles] Waiting for channel permission override attributes...");
	await waitForAttribute("channel_permission_overrides", "channelId");

	// Create indexes
	await ensureIndex("channel_permission_overrides", "channelId_idx", "key", ["channelId"]);
	await ensureIndex("channel_permission_overrides", "roleId_idx", "key", ["roleId"]);
	await ensureIndex("channel_permission_overrides", "userId_idx", "key", ["userId"]);

	info("[roles] Channel permission overrides collection setup complete");
	info("[roles] ✅ All roles & permissions collections created successfully!");
}

main().catch((error) => {
	process.stderr.write(`[roles] Error: ${error.message}\n`);
	process.exit(1);
});
