import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getAvatarUrl } from "@/lib/appwrite-profiles";
import { getServerSession } from "@/lib/auth-server";
import { getRelationshipMap } from "@/lib/appwrite-friendships";
import { apiCache } from "@/lib/cache-utils";

const USERS_SEARCH_CACHE_TTL_MS = 10 * 1000;

function canUseUsersSearchCache(): boolean {
    return process.env.NODE_ENV !== "test";
}

function dedupeUsersSearchCache<T>(key: string, fetcher: () => Promise<T>) {
    if (!canUseUsersSearchCache()) {
        return fetcher();
    }

    return apiCache.dedupe(key, fetcher, USERS_SEARCH_CACHE_TTL_MS);
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q");

        if (!query || query.trim().length < 2) {
            return NextResponse.json(
                { error: "Search query must be at least 2 characters" },
                { status: 400 },
            );
        }

        const { databases } = getAdminClient();
        const env = getEnvConfig();

        // Search by displayName (case-insensitive via contains) or exact userId match
        const searchTerm = query.trim();

        // First try exact userId match
        let profiles = await dedupeUsersSearchCache(
            `api:users-search:exact:${searchTerm}`,
            () =>
                databases.listDocuments(env.databaseId, env.collections.profiles, [
                    Query.equal("userId", searchTerm),
                    Query.limit(25),
                ]),
        );

        // If no exact userId match, search by displayName
        if (profiles.documents.length === 0) {
            profiles = await dedupeUsersSearchCache(
                `api:users-search:display-name:${searchTerm.toLowerCase()}`,
                () =>
                    databases.listDocuments(env.databaseId, env.collections.profiles, [
                        Query.search("displayName", searchTerm),
                        Query.limit(25),
                    ]),
            );
        }

        const rawUsers = profiles.documents.map((doc) => ({
            userId: String(doc.userId),
            displayName: doc.displayName ? String(doc.displayName) : undefined,
            pronouns: doc.pronouns ? String(doc.pronouns) : undefined,
            avatarUrl: doc.avatarFileId
                ? getAvatarUrl(String(doc.avatarFileId))
                : undefined,
        }));

        const candidateUserIds = rawUsers.map((user) => user.userId);
        const relationshipMap = await getRelationshipMap(
            session.$id,
            candidateUserIds,
        );
        const users = rawUsers.filter((user) => {
            if (user.userId === session.$id) {
                return false;
            }

            const relationship = relationshipMap.get(user.userId);
            return !relationship?.blockedByMe && !relationship?.blockedMe;
        });

        return NextResponse.json({ users });
    } catch {
        return NextResponse.json(
            { error: "Failed to search users" },
            { status: 500 },
        );
    }
}
