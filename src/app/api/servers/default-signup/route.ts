import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getUserRoles } from "@/lib/appwrite-roles";

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

    const response = await databases.listDocuments(
        env.databaseId,
        env.collections.servers,
        [
            Query.equal("defaultOnSignup", true),
            Query.orderAsc("$createdAt"),
            Query.limit(1),
        ],
    );

    const serverDocument = response.documents.at(0);
    if (!serverDocument) {
        return NextResponse.json({ server: null });
    }

    return NextResponse.json({
        server: {
            $id: serverDocument.$id,
            name: String((serverDocument as Record<string, unknown>).name ?? ""),
        },
    });
}
