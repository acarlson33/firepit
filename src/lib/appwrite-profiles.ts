/**
 * Profile management utilities for user profiles
 * Handles profile CRUD operations, avatar uploads, and profile queries
 * SERVER-ONLY — uses admin SDK. Client code should use /api/profiles/* routes.
 */

import { ID, Query } from "node-appwrite";
import { getAdminClient } from "./appwrite-admin";
import { getEnvConfig } from "./appwrite-core";
import { logger } from "./newrelic-utils";
import {
    getPresetFrameImageUrl,
    getPresetFrameStorageFileId,
} from "./preset-frames";

import type { NavigationItemPreferenceId } from "./types";

export type UserProfile = {
    $id: string;
    userId: string;
    userName?: string;
    displayName?: string;
    bio?: string;
    pronouns?: string;
    avatarFileId?: string;
    location?: string;
    website?: string;
    showDocsInNavigation?: boolean;
    showFriendsInNavigation?: boolean;
    showSettingsInNavigation?: boolean;
    showAddFriendInHeader?: boolean;
    telemetryEnabled?: boolean;
    navigationItemOrder?: NavigationItemPreferenceId[] | string;
    profileBackgroundColor?: string;
    profileBackgroundGradient?: string;
    profileBackgroundImageFileId?: string;
    profileBackgroundImageChangedAt?: string;
    avatarFramePreset?: string;
    $createdAt: string;
    $updatedAt: string;
};

type UserProfileUpdatePayload = {
    [K in keyof MutableUserProfileFields]?: MutableUserProfileFields[K] | null;
};

type MutableUserProfileFields = Omit<
    UserProfile,
    "$id" | "userId" | "$createdAt" | "$updatedAt"
>;

function chunkValues<T>(values: T[], size: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }

    return chunks;
}

/**
 * Get a user's profile by userId
 *
 * @param {string} userId - The user id value.
 * @returns {Promise<UserProfile | null>} The return value.
 */
export async function getUserProfile(
    userId: string,
): Promise<UserProfile | null> {
    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();

        const profiles = await databases.listDocuments(
            env.databaseId,
            env.collections.profiles,
            [Query.equal("userId", userId), Query.limit(1)],
        );

        if (profiles.documents.length === 0) {
            return null;
        }

        return profiles.documents[0] as unknown as UserProfile;
    } catch {
        return null;
    }
}

/**
 * Resolve a profile by either exact userId or exact userName.
 *
 * @param {string} identifier - The identifier value.
 * @returns {Promise<string | undefined>} The return value.
 */
export async function resolveProfileUserId(identifier: string) {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return undefined;
    }

    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();

        let profiles = await databases.listDocuments(
            env.databaseId,
            env.collections.profiles,
            [Query.equal("userId", trimmedIdentifier), Query.limit(1)],
        );

        if (profiles.documents.length === 0) {
            profiles = await databases.listDocuments(
                env.databaseId,
                env.collections.profiles,
                [Query.equal("userName", trimmedIdentifier), Query.limit(1)],
            );
        }

        const profile = profiles.documents[0] as unknown as
            | UserProfile
            | undefined;
        return profile?.userId;
    } catch {
        return undefined;
    }
}

/**
 * Handles resolve profile identifiers.
 *
 * @param {string[]} identifiers - The identifiers value.
 * @returns {Promise<Map<string, string>>} The return value.
 */
export async function resolveProfileIdentifiers(identifiers: string[]) {
    const trimmedIdentifiers = Array.from(
        new Set(
            identifiers.map((identifier) => identifier.trim()).filter(Boolean),
        ),
    );

    if (trimmedIdentifiers.length === 0) {
        return new Map<string, string>();
    }

    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();
        const identifierSet = new Set(trimmedIdentifiers);
        const identifierChunks = chunkValues(trimmedIdentifiers, 100);
        const documents: UserProfile[] = [];

        for (const chunk of identifierChunks) {
            const [byUserId, byUserName, byDisplayName] = await Promise.all([
                databases.listDocuments(
                    env.databaseId,
                    env.collections.profiles,
                    [Query.equal("userId", chunk), Query.limit(100)],
                ),
                databases.listDocuments(
                    env.databaseId,
                    env.collections.profiles,
                    [Query.equal("userName", chunk), Query.limit(100)],
                ),
                databases.listDocuments(
                    env.databaseId,
                    env.collections.profiles,
                    [Query.equal("displayName", chunk), Query.limit(100)],
                ),
            ]);

            documents.push(
                ...(byUserId.documents as unknown as UserProfile[]),
                ...(byUserName.documents as unknown as UserProfile[]),
                ...(byDisplayName.documents as unknown as UserProfile[]),
            );
        }

        const resolved = new Map<string, string>();
        for (const profile of documents) {
            const userId = profile.userId;

            if (identifierSet.has(userId)) {
                resolved.set(userId, userId);
            }

            if (profile.userName && identifierSet.has(profile.userName)) {
                resolved.set(profile.userName, userId);
            }

            if (profile.displayName && identifierSet.has(profile.displayName)) {
                resolved.set(profile.displayName, userId);
            }
        }

        return resolved;
    } catch {
        return new Map<string, string>();
    }
}

/**
 * Create a new user profile
 *
 * @param {string} userId - The user id value.
 * @param {{ userName?: string | undefined; displayName?: string | undefined; bio?: string | undefined; pronouns?: string | undefined; avatarFileId?: string | undefined; location?: string | undefined; website?: string | undefined; showDocsInNavigation?: boolean | undefined; showFriendsInNavigation?: boolean | undefined; showSettingsInNavigation?: boolean | undefined; showAddFriendInHeader?: boolean | undefined; navigationItemOrder?: string | NavigationItemPreferenceId[] | undefined; }} data - The data value.
 * @returns {Promise<UserProfile>} The return value.
 */
export async function createUserProfile(
    userId: string,
    data: Partial<
        Omit<UserProfile, "$id" | "userId" | "$createdAt" | "$updatedAt">
    >,
): Promise<UserProfile> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const profile = await databases.createDocument(
        env.databaseId,
        env.collections.profiles,
        ID.unique(),
        {
            userId,
            ...data,
        },
    );

    return profile as unknown as UserProfile;
}

/**
 * Update a user's profile
 *
 * @param {string} profileId - The profile id value.
 * @param {{ userName?: string | undefined; displayName?: string | undefined; bio?: string | undefined; pronouns?: string | undefined; avatarFileId?: string | undefined; location?: string | undefined; website?: string | undefined; showDocsInNavigation?: boolean | undefined; showFriendsInNavigation?: boolean | undefined; showSettingsInNavigation?: boolean | undefined; showAddFriendInHeader?: boolean | undefined; navigationItemOrder?: string | NavigationItemPreferenceId[] | undefined; }} data - The data value.
 * @returns {Promise<UserProfile>} The return value.
 */
export async function updateUserProfile(
    profileId: string,
    data: UserProfileUpdatePayload,
): Promise<UserProfile> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const cleanData: UserProfileUpdatePayload = {};
    const mutableCleanData = cleanData as Record<
        string,
        Exclude<UserProfileUpdatePayload[keyof UserProfileUpdatePayload], undefined>
    >;

    for (const key of Object.keys(data) as Array<keyof UserProfileUpdatePayload>) {
        const value = data[key];
        if (value !== undefined) {
            mutableCleanData[key] = value;
        }
    }

    if (Object.keys(cleanData).length === 0) {
        logger.warn("Skipped profile update because payload had no defined keys", {
            profileId,
        });
        const existing = await databases.getDocument(
            env.databaseId,
            env.collections.profiles,
            profileId,
        );
        return existing as unknown as UserProfile;
    }

    const profile = await databases.updateDocument(
        env.databaseId,
        env.collections.profiles,
        profileId,
        cleanData,
    );

    return profile as unknown as UserProfile;
}

/**
 * Get or create a user profile
 * Ensures every user has a profile
 *
 * @param {string} userId - The user id value.
 * @param {string | undefined} defaultDisplayName - The default display name value, if provided.
 * @returns {Promise<UserProfile>} The return value.
 */
export async function getOrCreateUserProfile(
    userId: string,
    defaultDisplayName?: string,
): Promise<UserProfile> {
    let profile = await getUserProfile(userId);

    if (!profile) {
        profile = await createUserProfile(userId, {
            displayName: defaultDisplayName,
        });
    }

    return profile;
}

/**
 * Delete a user's avatar file
 *
 * @param {string} fileId - The file id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteAvatarFile(fileId: string): Promise<void> {
    try {
        const { storage } = getAdminClient();
        const env = getEnvConfig();

        await storage.deleteFile(env.buckets.avatars, fileId);
    } catch {
        // Don't throw - avatar deletion is not critical
    }
}

/**
 * Delete a user's profile background image file
 *
 * @param {string} fileId - The file id value.
 * @returns {Promise<void>} The return value.
 */
export async function deleteProfileBackgroundFile(
    fileId: string,
): Promise<void> {
    try {
        const { storage } = getAdminClient();
        const env = getEnvConfig();

        await storage.deleteFile(env.buckets.profileBackgrounds, fileId);
    } catch {
        // Don't throw - file deletion is not critical
    }
}

/**
 * Get profile background image URL
 *
 * @param {string} fileId - The file id value.
 * @returns {string} The return value.
 */
export function getProfileBackgroundUrl(fileId: string): string {
    const env = getEnvConfig();
    return `${env.endpoint}/storage/buckets/${env.buckets.profileBackgrounds}/files/${fileId}/view?project=${env.project}`;
}

/**
 * Get predefined avatar frame image URL.
 *
 * @param {string} fileId - The file id value.
 * @returns {string} The return value.
 */
export function getPredefinedAvatarFrameUrl(fileId: string): string {
    const env = getEnvConfig();
    return `${env.endpoint}/storage/buckets/${env.buckets.avatarFramesPredefined}/files/${fileId}/view?project=${env.project}`;
}

/**
 * Get predefined avatar frame URL for a preset id.
 *
 * @param {string | undefined} presetId - The preset id value.
 * @returns {string | undefined} The return value.
 */
export function getPredefinedAvatarFrameUrlByPresetId(presetId?: string) {
    if (!presetId) {
        return undefined;
    }

    return getPresetFrameImageUrl(presetId);
}

/**
 * Get predefined frame URL only when the mapped backing file exists.
 *
 * @param {string | undefined} presetId - The preset id value.
 * @returns {Promise<string | undefined>} The return value.
 */
export async function getPredefinedAvatarFrameUrlIfExists(presetId?: string) {
    if (!presetId) {
        return undefined;
    }

    const storageFileId = getPresetFrameStorageFileId(presetId);
    if (!storageFileId) {
        return undefined;
    }

    try {
        const { storage } = getAdminClient();
        const env = getEnvConfig();
        await storage.getFile(
            env.buckets.avatarFramesPredefined,
            storageFileId,
        );
        return getPredefinedAvatarFrameUrl(storageFileId);
    } catch {
        return undefined;
    }
}

/**
 * Return the subset of preset frame IDs whose mapped files currently exist.
 *
 * @param {string[]} presetIds - Candidate preset IDs.
 * @returns {Promise<Set<string>>} The return value.
 */
export async function getExistingPredefinedAvatarFrameIds(presetIds: string[]) {
    const uniquePresetIds = [...new Set(presetIds.filter(Boolean))];
    if (uniquePresetIds.length === 0) {
        return new Set<string>();
    }

    try {
        const { storage } = getAdminClient();
        const env = getEnvConfig();

        // Limit concurrency to avoid overwhelming Appwrite at scale.
        const CHUNK_SIZE = 10;
        const existingPresetIds: (string | undefined)[] = [];
        for (const chunk of chunkValues(uniquePresetIds, CHUNK_SIZE)) {
            // Intentionally process chunks sequentially to cap concurrent getFile calls.
            const results = await Promise.all(
                chunk.map(async (presetId) => {
                    const storageFileId = getPresetFrameStorageFileId(presetId);
                    if (!storageFileId) {
                        return undefined;
                    }

                    try {
                        await storage.getFile(
                            env.buckets.avatarFramesPredefined,
                            storageFileId,
                        );
                        return presetId;
                    } catch {
                        return undefined;
                    }
                }),
            );
            existingPresetIds.push(...results);
        }

        return new Set(
            existingPresetIds.filter(
                (presetId): presetId is string => typeof presetId === "string",
            ),
        );
    } catch {
        return new Set<string>();
    }
}

/**
 * Resolve the best avatar frame URL for a profile.
 *
 * @param {{ avatarFramePreset?: string }} profile - Minimal frame profile.
 * @returns {Promise<string | undefined>} The return value.
 */
export async function getAvatarFrameUrlForProfile(profile: {
    avatarFramePreset?: string;
}) {
    return getPredefinedAvatarFrameUrlIfExists(profile.avatarFramePreset);
}

/**
 * Get avatar URL for a profile
 *
 * @param {string} fileId - The file id value.
 * @returns {string} The return value.
 */
export function getAvatarUrl(fileId: string): string {
    const env = getEnvConfig();
    return `${env.endpoint}/storage/buckets/${env.buckets.avatars}/files/${fileId}/view?project=${env.project}`;
}

/**
 * Search profiles by display name
 *
 * @param {string} searchTerm - The search term value.
 * @param {number} limit - The limit value, if provided.
 * @returns {Promise<UserProfile[]>} The return value.
 */
export async function searchProfiles(
    searchTerm: string,
    limit = 10,
): Promise<UserProfile[]> {
    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();

        const profiles = await databases.listDocuments(
            env.databaseId,
            env.collections.profiles,
            [Query.search("displayName", searchTerm), Query.limit(limit)],
        );

        return profiles.documents as unknown as UserProfile[];
    } catch {
        return [];
    }
}

/**
 * Get multiple profiles by user IDs
 *
 * @param {string[]} userIds - The user ids value.
 * @returns {Promise<Map<string, UserProfile>>} The return value.
 */
export async function getProfilesByUserIds(
    userIds: string[],
): Promise<Map<string, UserProfile>> {
    if (userIds.length === 0) {
        return new Map();
    }

    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();

        // Appwrite Query.equal supports arrays
        const profiles = await databases.listDocuments(
            env.databaseId,
            env.collections.profiles,
            [Query.equal("userId", userIds), Query.limit(userIds.length)],
        );

        const profileMap = new Map<string, UserProfile>();
        for (const doc of profiles.documents) {
            const profile = doc as unknown as UserProfile;
            profileMap.set(profile.userId, profile);
        }

        return profileMap;
    } catch {
        return new Map();
    }
}
