import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { returnUnauthorized, logger } from "@/lib/newrelic-utils";
import { listPages } from "@/lib/appwrite-pagination";
import type { Membership } from "@/lib/types";

/**
 * GET /api/memberships
 * Fetches all memberships for the authenticated user
 */
export async function GET() {
    try {
        // Verify user is authenticated
        const user = await getServerSession();
        if (!user) {
            return returnUnauthorized();
        }

        const env = getEnvConfig();
        const membershipCollectionId = env.collections.memberships;

        if (!membershipCollectionId) {
            return NextResponse.json({ memberships: [] });
        }

        const { databases } = getServerClient();
        const userId = user.$id;

        const { documents, truncated } = await listPages({
            databases,
            databaseId: env.databaseId,
            collectionId: membershipCollectionId,
            baseQueries: [Query.equal("userId", userId)],
            pageSize: 100,
            maxPages: 50,
            warningContext: "memberships",
        });

        const memberships: Membership[] = documents.map((doc) => {
            const d = doc as unknown as Record<string, unknown>;
            const role =
                d.role === "owner" || d.role === "member" ? d.role : "member";
            return {
                $id: String(d.$id),
                serverId: String(d.serverId),
                userId: String(d.userId),
                role,
                $createdAt: String(d.$createdAt ?? ""),
            } satisfies Membership;
        });

        return NextResponse.json({ memberships, truncated });
    } catch (error) {
        logger.error("Failed to fetch memberships", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch memberships" },
            { status: 500 },
        );
    }
}
