/**
 * Profile management utilities for user profiles
 * Handles profile CRUD operations, avatar uploads, and profile queries
 * SERVER-ONLY — uses admin SDK. Client code should use /api/profiles/* routes.
 */

import { ID, Query } from "node-appwrite";
import { getAdminClient } from "./appwrite-admin";
import { getEnvConfig } from "./appwrite-core";

export type UserProfile = {
    $id: string;
    userId: string;
    displayName?: string;
    bio?: string;
    pronouns?: string;
    avatarFileId?: string;
    location?: string;
    website?: string;
    $createdAt: string;
    $updatedAt: string;
};

/**
 * Get a user's profile by userId
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
 * Create a new user profile
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
 */
export async function updateUserProfile(
    profileId: string,
    data: Partial<
        Omit<UserProfile, "$id" | "userId" | "$createdAt" | "$updatedAt">
    >,
): Promise<UserProfile> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();

    const profile = await databases.updateDocument(
        env.databaseId,
        env.collections.profiles,
        profileId,
        data,
    );

    return profile as unknown as UserProfile;
}

/**
 * Get or create a user profile
 * Ensures every user has a profile
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
 * Get avatar URL for a profile
 */
export function getAvatarUrl(fileId: string): string {
    const env = getEnvConfig();
    return `${env.endpoint}/storage/buckets/${env.buckets.avatars}/files/${fileId}/view?project=${env.project}`;
}

/**
 * Search profiles by display name
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
