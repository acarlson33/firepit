import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/appwrite-server";
import { logger,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { fetchAuditLogs } from "@/lib/audit-log-query";

const MAX_AUDIT_LOG_LIMIT = 1000;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const { serverId } = await params;
        const { searchParams } = new URL(request.url);
        const parsedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
        const limit = Number.isNaN(parsedLimit)
            ? 50
            : Math.min(Math.max(parsedLimit, 1), MAX_AUDIT_LOG_LIMIT);
        const { databases } = getServerClient();
        const env = getEnvConfig();

        const session = await getServerSession();
        if (!session?.$id) {
            return returnUnauthorized();
        }

        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageServer) {
            return returnForbidden();
        }

        const enrichedLogs = await fetchAuditLogs({
            databases,
            databaseId: env.databaseId,
            auditCollectionId: env.collections.audit,
            profilesCollectionId: env.collections.profiles,
            serverId,
            limit,
        });

        return NextResponse.json(enrichedLogs);
    } catch (error) {
        logger.error("Error fetching audit logs", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to fetch audit logs" },
            { status: 500 },
        );
    }
}
