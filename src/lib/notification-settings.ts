/**
 * Notification settings management utilities
 * Handles CRUD operations for user notification preferences
 */

import { ID, Query } from "node-appwrite";
import { getAdminClient } from "./appwrite-admin";
import { getEnvConfig, perms } from "./appwrite-core";
import { apiCache } from "./cache-utils";
import { logger } from "./newrelic-utils";
import type {
    Conversation,
    NotificationSettings,
    NotificationLevel,
    NotificationOverride,
    NotificationOverrideLabelMap,
    NotificationOverrideMap,
    NotificationSettingsResponse,
    MuteDuration,
    DirectMessagePrivacy,
} from "./types";

const LABEL_LOOKUP_LIMIT = 500;
const DM_ENCRYPTION_ATTRIBUTE_KEY = "dmEncryptionEnabled";
const NOTIFICATION_OVERRIDE_LABEL_CACHE_TTL_MS = 15 * 1000;

const DEFAULT_SETTINGS: Omit<
    NotificationSettings,
    "$id" | "userId" | "$createdAt" | "$updatedAt"
> = {
    globalNotifications: "all",
    directMessagePrivacy: "everyone",
    dmEncryptionEnabled: false,
    desktopNotifications: true,
    pushNotifications: true,
    notificationSound: true,
    quietHoursStart: undefined,
    quietHoursEnd: undefined,
    quietHoursTimezone: undefined,
    serverOverrides: {},
    channelOverrides: {},
    conversationOverrides: {},
};

class NotificationSettingsSchemaError extends Error {
    status: number;

    constructor(message: string, status = 503) {
        super(message);
        this.name = "NotificationSettingsSchemaError";
        this.status = status;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function isSchemaErrorMessage(message: string): boolean {
    const normalized = message.toLowerCase();

    return (
        normalized.includes("attribute not found in schema") ||
        normalized.includes("attribute not available") ||
        normalized.includes("requested attribute") ||
        normalized.includes("unknown attribute")
    );
}

function isMissingDmEncryptionAttributeError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return (
        isSchemaErrorMessage(message) &&
        message.includes(DM_ENCRYPTION_ATTRIBUTE_KEY.toLowerCase())
    );
}

function createSchemaUnavailableError() {
    return new NotificationSettingsSchemaError(
        "Notification settings schema is missing dmEncryptionEnabled. Run `bun run setup` to provision the latest Appwrite attributes.",
    );
}

function cloneOverrideLabels(
    value: NotificationOverrideLabelMap,
): NotificationOverrideLabelMap {
    if (typeof globalThis.structuredClone === "function") {
        return globalThis.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as NotificationOverrideLabelMap;
}

async function ensureDmEncryptionSettingsAttribute(): Promise<boolean> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const dbAny = databases as unknown as {
        createBooleanAttribute?: (...args: unknown[]) => Promise<unknown>;
    };

    if (typeof dbAny.createBooleanAttribute !== "function") {
        return false;
    }

    try {
        await dbAny.createBooleanAttribute(
            env.databaseId,
            env.collections.notificationSettings,
            DM_ENCRYPTION_ATTRIBUTE_KEY,
            false,
        );
        return true;
    } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        if (
            message.includes("already exists") ||
            message.includes("attribute_already_exists")
        ) {
            return true;
        }

        return false;
    }
}

async function runWithDmEncryptionAttributeRecovery<T>(
    operation: () => Promise<T>,
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingDmEncryptionAttributeError(error)) {
            throw error;
        }

        const repaired = await ensureDmEncryptionSettingsAttribute();
        if (!repaired) {
            throw createSchemaUnavailableError();
        }

        try {
            return await operation();
        } catch (retryError) {
            if (isMissingDmEncryptionAttributeError(retryError)) {
                throw createSchemaUnavailableError();
            }

            throw retryError;
        }
    }
}

/**
 * Creates empty override labels.
 * @returns {{ channelOverrides: Record<string, NotificationOverrideLabelEntry>; conversationOverrides: Record<string, NotificationOverrideLabelEntry>; serverOverrides: Record<string, NotificationOverrideLabelEntry>; }} The return value.
 */
function createEmptyOverrideLabels(): NotificationOverrideLabelMap {
    return {
        serverOverrides: {},
        channelOverrides: {},
        conversationOverrides: {},
    };
}

function buildOverrideLabelCacheKey(
    userId: string,
    serverOverrideIds: string[],
    channelOverrideIds: string[],
    conversationOverrideIds: string[],
): string {
    const sortedServerIds = [...serverOverrideIds].sort().join(",");
    const sortedChannelIds = [...channelOverrideIds].sort().join(",");
    const sortedConversationIds = [...conversationOverrideIds].sort().join(",");

    return `notification-overrides:${userId}:servers=${sortedServerIds}:channels=${sortedChannelIds}:conversations=${sortedConversationIds}`;
}

/**
 * Parse JSON string overrides from database into typed objects
 *
 * @param {unknown} value - The value value.
 * @returns {boolean} The return value.
 */
function isNotificationLevel(value: unknown): value is NotificationLevel {
    return value === "all" || value === "mentions" || value === "nothing";
}

/**
 * Determines whether is direct message privacy.
 *
 * @param {unknown} value - The value value.
 * @returns {boolean} The return value.
 */
function isDirectMessagePrivacy(value: unknown): value is DirectMessagePrivacy {
    return value === "everyone" || value === "friends";
}

/**
 * Parses overrides.
 *
 * @param {unknown} value - The value value.
 * @returns {{ [x: string]: NotificationOverride; }} The return value.
 */
function parseOverrides(value: unknown): NotificationOverrideMap {
    if (!value) {
        return {};
    }

    const candidate =
        typeof value === "string"
            ? (() => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return null;
                  }
              })()
            : value;

    if (!candidate || typeof candidate !== "object") {
        return {};
    }

    const normalizedOverrides: NotificationOverrideMap = {};
    for (const [overrideId, rawOverride] of Object.entries(candidate)) {
        if (!rawOverride || typeof rawOverride !== "object") {
            continue;
        }

        const level = (rawOverride as NotificationOverride).level;
        if (!isNotificationLevel(level)) {
            continue;
        }

        const mutedUntil = (rawOverride as NotificationOverride).mutedUntil;
        normalizedOverrides[overrideId] = {
            level,
            mutedUntil: typeof mutedUntil === "string" ? mutedUntil : undefined,
        };
    }

    return normalizedOverrides;
}

/**
 * Convert database document to NotificationSettings type
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {{ $id: string; userId: string; globalNotifications: NotificationLevel; directMessagePrivacy: 'everyone' | 'friends'; desktopNotifications: boolean; pushNotifications: boolean; notificationSound: boolean; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} The return value.
 */
function documentToSettings(
    doc: Record<string, unknown>,
): NotificationSettings {
    const dmEncryptionEnabled =
        typeof doc.dmEncryptionEnabled === "boolean"
            ? doc.dmEncryptionEnabled
            : undefined;

    return {
        $id: String(doc.$id),
        userId: String(doc.userId),
        globalNotifications:
            (doc.globalNotifications as NotificationLevel) || "all",
        directMessagePrivacy:
            (doc.directMessagePrivacy as DirectMessagePrivacy) || "everyone",
        dmEncryptionEnabled,
        desktopNotifications: Boolean(doc.desktopNotifications ?? true),
        pushNotifications: Boolean(doc.pushNotifications ?? true),
        notificationSound: Boolean(doc.notificationSound ?? true),
        quietHoursStart: doc.quietHoursStart
            ? String(doc.quietHoursStart)
            : undefined,
        quietHoursEnd: doc.quietHoursEnd
            ? String(doc.quietHoursEnd)
            : undefined,
        quietHoursTimezone: doc.quietHoursTimezone
            ? String(doc.quietHoursTimezone)
            : undefined,
        serverOverrides: parseOverrides(doc.serverOverrides),
        channelOverrides: parseOverrides(doc.channelOverrides),
        conversationOverrides: parseOverrides(doc.conversationOverrides),
        $createdAt: doc.$createdAt ? String(doc.$createdAt) : undefined,
        $updatedAt: doc.$updatedAt ? String(doc.$updatedAt) : undefined,
    };
}

/**
 * Returns legacy settings backfill.
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {{ [x: string]: unknown; }} The return value.
 */
function getLegacySettingsBackfill(
    doc: Record<string, unknown>,
): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};

    if (!isNotificationLevel(doc.globalNotifications)) {
        updateData.globalNotifications = DEFAULT_SETTINGS.globalNotifications;
    }

    if (!isDirectMessagePrivacy(doc.directMessagePrivacy)) {
        updateData.directMessagePrivacy = DEFAULT_SETTINGS.directMessagePrivacy;
    }

    if (typeof doc.desktopNotifications !== "boolean") {
        updateData.desktopNotifications = DEFAULT_SETTINGS.desktopNotifications;
    }

    if (typeof doc.pushNotifications !== "boolean") {
        updateData.pushNotifications = DEFAULT_SETTINGS.pushNotifications;
    }

    if (typeof doc.notificationSound !== "boolean") {
        updateData.notificationSound = DEFAULT_SETTINGS.notificationSound;
    }

    if (doc.serverOverrides === undefined) {
        updateData.serverOverrides = JSON.stringify(
            DEFAULT_SETTINGS.serverOverrides,
        );
    }

    if (doc.channelOverrides === undefined) {
        updateData.channelOverrides = JSON.stringify(
            DEFAULT_SETTINGS.channelOverrides,
        );
    }

    if (doc.conversationOverrides === undefined) {
        updateData.conversationOverrides = JSON.stringify(
            DEFAULT_SETTINGS.conversationOverrides,
        );
    }

    return updateData;
}

/**
 * Handles backfill legacy notification settings document.
 *
 * @param {{ [x: string]: unknown; }} doc - The doc value.
 * @returns {Promise<Record<string, unknown>>} The return value.
 */
async function backfillLegacyNotificationSettingsDocument(
    doc: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const updateData = getLegacySettingsBackfill(doc);
    if (Object.keys(updateData).length === 0) {
        return doc;
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const updated = await databases.updateDocument(
        env.databaseId,
        env.collections.notificationSettings,
        String(doc.$id),
        updateData,
    );

    return updated as unknown as Record<string, unknown>;
}

/**
 * Lists accessible servers by id.
 *
 * @param {string} userId - The user id value.
 * @param {string[]} serverIds - The server ids value.
 * @returns {Promise<Record<string, unknown>[]>} The return value.
 */
async function listAccessibleServersById(
    userId: string,
    serverIds: string[],
): Promise<Array<Record<string, unknown>>> {
    if (serverIds.length === 0) {
        return [];
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const memberships = await databases.listDocuments(
        env.databaseId,
        env.collections.memberships,
        [
            Query.equal("userId", userId),
            Query.equal("serverId", serverIds),
            Query.limit(LABEL_LOOKUP_LIMIT),
        ],
    );

    const allowedServerIds = memberships.documents
        .map((membership) => {
            const record = membership as unknown as Record<string, unknown>;
            return typeof record.serverId === "string" ? record.serverId : null;
        })
        .filter((serverId): serverId is string => Boolean(serverId));

    if (allowedServerIds.length === 0) {
        return [];
    }

    const servers = await databases.listDocuments(
        env.databaseId,
        env.collections.servers,
        [Query.equal("$id", allowedServerIds), Query.limit(LABEL_LOOKUP_LIMIT)],
    );

    return servers.documents as unknown as Array<Record<string, unknown>>;
}

/**
 * Lists accessible channels by id.
 *
 * @param {string[]} allowedServerIds - The allowed server ids value.
 * @param {string[]} channelIds - The channel ids value.
 * @returns {Promise<Record<string, unknown>[]>} The return value.
 */
async function listAccessibleChannelsById(
    allowedServerIds: string[],
    channelIds: string[],
): Promise<Array<Record<string, unknown>>> {
    if (allowedServerIds.length === 0 || channelIds.length === 0) {
        return [];
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const channels = await databases.listDocuments(
        env.databaseId,
        env.collections.channels,
        [
            Query.equal("$id", channelIds),
            Query.equal("serverId", allowedServerIds),
            Query.limit(LABEL_LOOKUP_LIMIT),
        ],
    );

    return channels.documents as unknown as Array<Record<string, unknown>>;
}

/**
 * Lists accessible conversations by id.
 *
 * @param {string} userId - The user id value.
 * @param {string[]} conversationIds - The conversation ids value.
 * @returns {Promise<Conversation[]>} The return value.
 */
async function listAccessibleConversationsById(
    userId: string,
    conversationIds: string[],
): Promise<Conversation[]> {
    if (conversationIds.length === 0) {
        return [];
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const conversations = await databases.listDocuments(
        env.databaseId,
        env.collections.conversations,
        [
            Query.equal("$id", conversationIds),
            Query.contains("participants", userId),
            Query.limit(LABEL_LOOKUP_LIMIT),
        ],
    );

    return conversations.documents.map((document) => {
        const record = document as unknown as Record<string, unknown>;
        const participants = Array.isArray(record.participants)
            ? record.participants.filter(
                  (participant): participant is string =>
                      typeof participant === "string",
              )
            : [];

        return {
            $id: String(record.$id),
            participants,
            $createdAt: String(record.$createdAt ?? ""),
            isGroup: Boolean(record.isGroup) || participants.length > 2,
            name: typeof record.name === "string" ? record.name : undefined,
            participantCount: participants.length,
        } satisfies Conversation;
    });
}

/**
 * Lists profiles by user id.
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<Map<string, string>>} The return value.
 */
async function listProfilesByUserId(
    userIds: string[],
): Promise<Map<string, string>> {
    if (userIds.length === 0) {
        return new Map();
    }

    const { databases } = getAdminClient();
    const env = getEnvConfig();
    const profiles = await databases.listDocuments(
        env.databaseId,
        env.collections.profiles,
        [Query.equal("userId", userIds), Query.limit(LABEL_LOOKUP_LIMIT)],
    );

    return new Map(
        profiles.documents.map((document) => {
            const record = document as unknown as Record<string, unknown>;
            const userId = String(record.userId);
            const displayName =
                typeof record.displayName === "string"
                    ? record.displayName
                    : userId;
            return [userId, displayName];
        }),
    );
}

/**
 * Handles resolve notification override labels.
 *
 * @param {string} userId - The user id value.
 * @param {{ $id: string; userId: string; globalNotifications: NotificationLevel; directMessagePrivacy: 'everyone' | 'friends'; desktopNotifications: boolean; pushNotifications: boolean; notificationSound: boolean; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} settings - The settings value.
 * @returns {Promise<NotificationOverrideLabelMap>} The return value.
 */
async function resolveNotificationOverrideLabels(
    userId: string,
    settings: NotificationSettings,
): Promise<NotificationOverrideLabelMap> {
    const labels = createEmptyOverrideLabels();
    const serverOverrideIds = Object.keys(settings.serverOverrides ?? {});
    const channelOverrideIds = Object.keys(settings.channelOverrides ?? {});
    const conversationOverrideIds = Object.keys(
        settings.conversationOverrides ?? {},
    );

    if (
        serverOverrideIds.length === 0 &&
        channelOverrideIds.length === 0 &&
        conversationOverrideIds.length === 0
    ) {
        return labels;
    }

    const fetchLabels = async () => {
        try {
            const servers = await listAccessibleServersById(
                userId,
                serverOverrideIds,
            );
            const serverNameById = new Map(
                servers.map((server) => [String(server.$id), String(server.name)]),
            );
            const allowedServerIds = Array.from(serverNameById.keys());

            for (const server of servers) {
                const serverId = String(server.$id);
                labels.serverOverrides[serverId] = {
                    title: String(server.name),
                    subtitle: "Server notification override",
                };
            }

            const [channels, conversations] = await Promise.all([
                listAccessibleChannelsById(
                    allowedServerIds,
                    channelOverrideIds,
                ),
                listAccessibleConversationsById(
                    userId,
                    conversationOverrideIds,
                ),
            ]);

            for (const channel of channels) {
                const channelId = String(channel.$id);
                const serverId = String(channel.serverId);
                labels.channelOverrides[channelId] = {
                    title: `#${String(channel.name)}`,
                    subtitle:
                        serverNameById.get(serverId) ??
                        "Channel notification override",
                    meta: `Channel in ${serverNameById.get(serverId) ?? "server"}`,
                };
            }

            const otherParticipantIds = Array.from(
                new Set(
                    conversations.flatMap((conversation) =>
                        conversation.participants.filter(
                            (participantId) => participantId !== userId,
                        ),
                    ),
                ),
            );
            const profileNameByUserId =
                await listProfilesByUserId(otherParticipantIds);

            for (const conversation of conversations) {
                const otherParticipants = conversation.participants.filter(
                    (participantId) => participantId !== userId,
                );
                const participantNames = otherParticipants.map(
                    (participantId) =>
                        profileNameByUserId.get(participantId) ?? participantId,
                );
                const title =
                    conversation.name ||
                    participantNames.at(0) ||
                    (conversation.isGroup ? "Group DM" : "Direct message");

                labels.conversationOverrides[conversation.$id] = {
                    title,
                    subtitle: conversation.isGroup
                        ? `${conversation.participantCount ?? conversation.participants.length} participants`
                        : "Direct message override",
                    meta: conversation.isGroup
                        ? participantNames.slice(0, 3).join(", ")
                        : participantNames.at(0),
                };
            }
        } catch (error) {
            logger.error("Failed to resolve notification override labels", {
                userId,
                error: getErrorMessage(error),
            });
            return createEmptyOverrideLabels();
        }

        return cloneOverrideLabels(labels);
    };

    if (process.env.NODE_ENV === "test") {
        return fetchLabels();
    }

    return apiCache.dedupe(
        buildOverrideLabelCacheKey(
            userId,
            serverOverrideIds,
            channelOverrideIds,
            conversationOverrideIds,
        ),
        fetchLabels,
        NOTIFICATION_OVERRIDE_LABEL_CACHE_TTL_MS,
    );
}

/**
 * Builds notification settings response.
 *
 * @param {string} userId - The user id value.
 * @param {{ $id: string; userId: string; globalNotifications: NotificationLevel; directMessagePrivacy: 'everyone' | 'friends'; desktopNotifications: boolean; pushNotifications: boolean; notificationSound: boolean; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} settings - The settings value.
 * @returns {Promise<NotificationSettingsResponse>} The return value.
 */
export async function buildNotificationSettingsResponse(
    userId: string,
    settings: NotificationSettings,
): Promise<NotificationSettingsResponse> {
    const overrideLabels = await resolveNotificationOverrideLabels(
        userId,
        settings,
    );

    return {
        ...settings,
        overrideLabels,
    };
}

/**
 * Get notification settings for a user
 * Returns null if settings don't exist yet
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<NotificationSettings | null>} The return value.
 */
export async function getNotificationSettings(
    userId: string,
): Promise<NotificationSettings | null> {
    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();

        const result = await databases.listDocuments(
            env.databaseId,
            env.collections.notificationSettings,
            [Query.equal("userId", userId), Query.limit(1)],
        );

        if (result.documents.length === 0) {
            return null;
        }

        const document = await backfillLegacyNotificationSettingsDocument(
            result.documents[0] as unknown as Record<string, unknown>,
        );

        return documentToSettings(document);
    } catch {
        return null;
    }
}

/**
 * Get or create notification settings for a user
 * Creates default settings if they don't exist
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function getOrCreateNotificationSettings(
    userId: string,
): Promise<NotificationSettings> {
    const existing = await getNotificationSettings(userId);
    if (existing) {
        return existing;
    }

    return createNotificationSettings(userId, DEFAULT_SETTINGS);
}

/**
 * Create notification settings for a user
 *
 * @param {string} userId - The user id value.
 * @param {{ globalNotifications?: NotificationLevel | undefined; directMessagePrivacy?: 'everyone' | 'friends' | undefined; desktopNotifications?: boolean | undefined; pushNotifications?: boolean | undefined; notificationSound?: boolean | undefined; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; }} data - The data value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function createNotificationSettings(
    userId: string,
    data: Partial<
        Omit<
            NotificationSettings,
            "$id" | "userId" | "$createdAt" | "$updatedAt"
        >
    >,
): Promise<NotificationSettings> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const docData = {
        userId,
        globalNotifications:
            data.globalNotifications ?? DEFAULT_SETTINGS.globalNotifications,
        directMessagePrivacy:
            data.directMessagePrivacy ?? DEFAULT_SETTINGS.directMessagePrivacy,
        dmEncryptionEnabled:
            data.dmEncryptionEnabled ?? DEFAULT_SETTINGS.dmEncryptionEnabled,
        desktopNotifications:
            data.desktopNotifications ?? DEFAULT_SETTINGS.desktopNotifications,
        pushNotifications:
            data.pushNotifications ?? DEFAULT_SETTINGS.pushNotifications,
        notificationSound:
            data.notificationSound ?? DEFAULT_SETTINGS.notificationSound,
        quietHoursStart:
            data.quietHoursStart !== undefined ? data.quietHoursStart : null,
        quietHoursEnd:
            data.quietHoursEnd !== undefined ? data.quietHoursEnd : null,
        quietHoursTimezone:
            data.quietHoursTimezone !== undefined
                ? data.quietHoursTimezone
                : null,
        serverOverrides: JSON.stringify(data.serverOverrides ?? {}),
        channelOverrides: JSON.stringify(data.channelOverrides ?? {}),
        conversationOverrides: JSON.stringify(data.conversationOverrides ?? {}),
    };

    const doc = await runWithDmEncryptionAttributeRecovery(() =>
        databases.createDocument(
            env.databaseId,
            env.collections.notificationSettings,
            ID.unique(),
            docData,
            perms.serverOwner(userId),
        ),
    );

    return documentToSettings(doc as unknown as Record<string, unknown>);
}

/**
 * Update notification settings for a user
 *
 * @param {string} settingsId - The settings id value.
 * @param {{ globalNotifications?: NotificationLevel | undefined; directMessagePrivacy?: 'everyone' | 'friends' | undefined; desktopNotifications?: boolean | undefined; pushNotifications?: boolean | undefined; notificationSound?: boolean | undefined; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; }} data - The data value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function updateNotificationSettings(
    settingsId: string,
    data: Partial<
        Omit<
            NotificationSettings,
            "$id" | "userId" | "$createdAt" | "$updatedAt"
        >
    >,
): Promise<NotificationSettings> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    // Build update object, only including defined fields
    const updateData: Record<string, unknown> = {};

    if (data.globalNotifications !== undefined) {
        updateData.globalNotifications = data.globalNotifications;
    }
    if (data.directMessagePrivacy !== undefined) {
        updateData.directMessagePrivacy = data.directMessagePrivacy;
    }
    if (data.dmEncryptionEnabled !== undefined) {
        updateData.dmEncryptionEnabled = data.dmEncryptionEnabled;
    }
    if (data.desktopNotifications !== undefined) {
        updateData.desktopNotifications = data.desktopNotifications;
    }
    if (data.pushNotifications !== undefined) {
        updateData.pushNotifications = data.pushNotifications;
    }
    if (data.notificationSound !== undefined) {
        updateData.notificationSound = data.notificationSound;
    }
    if (data.quietHoursStart !== undefined) {
        updateData.quietHoursStart = data.quietHoursStart ?? null;
    }
    if (data.quietHoursEnd !== undefined) {
        updateData.quietHoursEnd = data.quietHoursEnd ?? null;
    }
    if (data.quietHoursTimezone !== undefined) {
        updateData.quietHoursTimezone = data.quietHoursTimezone ?? null;
    }
    if (data.serverOverrides !== undefined) {
        updateData.serverOverrides = JSON.stringify(data.serverOverrides);
    }
    if (data.channelOverrides !== undefined) {
        updateData.channelOverrides = JSON.stringify(data.channelOverrides);
    }
    if (data.conversationOverrides !== undefined) {
        updateData.conversationOverrides = JSON.stringify(
            data.conversationOverrides,
        );
    }

    const doc = await runWithDmEncryptionAttributeRecovery(() =>
        databases.updateDocument(
            env.databaseId,
            env.collections.notificationSettings,
            settingsId,
            updateData,
        ),
    );

    return documentToSettings(doc as unknown as Record<string, unknown>);
}

/**
 * Calculate mute expiration timestamp from duration
 *
 * @param {'15m' | '1h' | '8h' | '24h' | 'forever'} duration - The duration value.
 * @returns {string | undefined} The return value.
 */
export function calculateMuteExpiration(
    duration: MuteDuration,
): string | undefined {
    if (duration === "forever") {
        return undefined; // No expiration
    }

    const durationMs: Record<Exclude<MuteDuration, "forever">, number> = {
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "8h": 8 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + durationMs[duration]).toISOString();
}

/**
 * Check if a mute has expired
 *
 * @param {string | undefined} mutedUntil - The muted until value.
 * @returns {boolean} The return value.
 */
export function isMuteExpired(mutedUntil: string | undefined): boolean {
    if (!mutedUntil) {
        return false; // No expiration means muted forever
    }

    const mutedUntilMs = Date.parse(mutedUntil);
    if (Number.isNaN(mutedUntilMs)) {
        // Treat invalid timestamps as expired to avoid sticky mutes.
        return true;
    }

    return mutedUntilMs <= Date.now();
}

/**
 * Mute a server for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} serverId - The server id value.
 * @param {'15m' | '1h' | '8h' | '24h' | 'forever'} duration - The duration value.
 * @param {'all' | 'mentions' | 'nothing'} level - The level value, if provided.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function muteServer(
    userId: string,
    serverId: string,
    duration: MuteDuration,
    level: NotificationLevel = "nothing",
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const serverOverrides = { ...settings.serverOverrides };

    serverOverrides[serverId] = {
        level,
        mutedUntil: calculateMuteExpiration(duration),
    };

    return updateNotificationSettings(settings.$id, { serverOverrides });
}

/**
 * Unmute a server for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} serverId - The server id value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function unmuteServer(
    userId: string,
    serverId: string,
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const serverOverrides = { ...settings.serverOverrides };

    delete serverOverrides[serverId];

    return updateNotificationSettings(settings.$id, { serverOverrides });
}

/**
 * Mute a channel for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} channelId - The channel id value.
 * @param {'15m' | '1h' | '8h' | '24h' | 'forever'} duration - The duration value.
 * @param {'all' | 'mentions' | 'nothing'} level - The level value, if provided.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function muteChannel(
    userId: string,
    channelId: string,
    duration: MuteDuration,
    level: NotificationLevel = "nothing",
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const channelOverrides = { ...settings.channelOverrides };

    channelOverrides[channelId] = {
        level,
        mutedUntil: calculateMuteExpiration(duration),
    };

    return updateNotificationSettings(settings.$id, { channelOverrides });
}

/**
 * Unmute a channel for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} channelId - The channel id value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function unmuteChannel(
    userId: string,
    channelId: string,
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const channelOverrides = { ...settings.channelOverrides };

    delete channelOverrides[channelId];

    return updateNotificationSettings(settings.$id, { channelOverrides });
}

/**
 * Mute a conversation for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} conversationId - The conversation id value.
 * @param {'15m' | '1h' | '8h' | '24h' | 'forever'} duration - The duration value.
 * @param {'all' | 'mentions' | 'nothing'} level - The level value, if provided.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function muteConversation(
    userId: string,
    conversationId: string,
    duration: MuteDuration,
    level: NotificationLevel = "nothing",
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const conversationOverrides = { ...settings.conversationOverrides };

    conversationOverrides[conversationId] = {
        level,
        mutedUntil: calculateMuteExpiration(duration),
    };

    return updateNotificationSettings(settings.$id, { conversationOverrides });
}

/**
 * Unmute a conversation for a user
 *
 * @param {string} userId - The user id value.
 * @param {string} conversationId - The conversation id value.
 * @returns {Promise<NotificationSettings>} The return value.
 */
export async function unmuteConversation(
    userId: string,
    conversationId: string,
): Promise<NotificationSettings> {
    const settings = await getOrCreateNotificationSettings(userId);
    const conversationOverrides = { ...settings.conversationOverrides };

    delete conversationOverrides[conversationId];

    return updateNotificationSettings(settings.$id, { conversationOverrides });
}

/**
 * Get the effective notification level for a specific context
 * Priority: Channel > Server > Global
 *
 * @param {{ $id: string; userId: string; globalNotifications: NotificationLevel; directMessagePrivacy: 'everyone' | 'friends'; desktopNotifications: boolean; pushNotifications: boolean; notificationSound: boolean; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} settings - The settings value.
 * @param {{ channelId?: string | undefined; serverId?: string | undefined; conversationId?: string | undefined; }} context - The context value.
 * @returns {'all' | 'mentions' | 'nothing'} The return value.
 */
export function getEffectiveNotificationLevel(
    settings: NotificationSettings,
    context: {
        channelId?: string;
        serverId?: string;
        conversationId?: string;
    },
): NotificationLevel {
    // Check conversation override first (for DMs)
    if (context.conversationId && settings.conversationOverrides) {
        const override = settings.conversationOverrides[context.conversationId];
        if (override && !isMuteExpired(override.mutedUntil)) {
            return override.level;
        }
    }

    // Check channel override (most specific for channels)
    if (context.channelId && settings.channelOverrides) {
        const override = settings.channelOverrides[context.channelId];
        if (override && !isMuteExpired(override.mutedUntil)) {
            return override.level;
        }
    }

    // Check server override
    if (context.serverId && settings.serverOverrides) {
        const override = settings.serverOverrides[context.serverId];
        if (override && !isMuteExpired(override.mutedUntil)) {
            return override.level;
        }
    }

    // Fall back to global setting
    return settings.globalNotifications;
}

/**
 * Check if current time is within quiet hours
 *
 * @param {{ $id: string; userId: string; globalNotifications: NotificationLevel; directMessagePrivacy: 'everyone' | 'friends'; desktopNotifications: boolean; pushNotifications: boolean; notificationSound: boolean; quietHoursStart?: string | undefined; quietHoursEnd?: string | undefined; quietHoursTimezone?: string | undefined; serverOverrides?: NotificationOverrideMap | undefined; channelOverrides?: NotificationOverrideMap | undefined; conversationOverrides?: NotificationOverrideMap | undefined; $createdAt?: string | undefined; $updatedAt?: string | undefined; }} settings - The settings value.
 * @returns {boolean} The return value.
 */
export function isInQuietHours(settings: NotificationSettings): boolean {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) {
        return false;
    }

    const now = new Date();
    let currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (settings.quietHoursTimezone) {
        try {
            const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: settings.quietHoursTimezone,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
            const parts = formatter.formatToParts(now);
            const hours = Number(
                parts.find((part) => part.type === "hour")?.value ?? "0",
            );
            const minutes = Number(
                parts.find((part) => part.type === "minute")?.value ?? "0",
            );
            currentMinutes = hours * 60 + minutes;
        } catch {
            // Fall back to the user's local time if the timezone is invalid.
        }
    }

    const [startHour, startMin] = settings.quietHoursStart
        .split(":")
        .map(Number);
    const [endHour, endMin] = settings.quietHoursEnd.split(":").map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Normal range (e.g., 00:00 - 08:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
