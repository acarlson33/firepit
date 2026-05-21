import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { logger } from "@/lib/newrelic-utils";

type DefaultSignupServerDocument = {
    $id: string;
    name?: string;
};

export async function GET() {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const roles = await getUserRoles(session.$id);
    if (!roles.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();

    let response: Awaited<ReturnType<typeof databases.listDocuments>>;
    try {
        response = await databases.listDocuments(
            env.databaseId,
            env.collections.servers,
            [
                Query.equal("defaultOnSignup", true),
                Query.orderAsc("$createdAt"),
                Query.limit(1),
            ],
        );
    } catch (error) {
        logger.error("Failed to load default signup server", {
            error: error instanceof Error ? error.message : String(error),
            databaseId: env.databaseId,
            serversCollectionId: env.collections.servers,
        });
        return NextResponse.json(
            { error: "Failed to load default signup server" },
            { status: 500 },
        );
    }

    const serverDocument = response.documents.at(0) as
        | DefaultSignupServerDocument
        | undefined;
    if (!serverDocument) {
        return NextResponse.json({ server: null });
    }

    const serverName =
        typeof serverDocument.name === "string" ? serverDocument.name : "";

    return NextResponse.json({
        server: {
            $id: serverDocument.$id,
            name: serverName,
        },
    });
}
