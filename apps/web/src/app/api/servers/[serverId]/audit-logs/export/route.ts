import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { logger,
    returnUnauthorized,
    returnForbidden,
} from "@/lib/newrelic-utils";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { fetchAuditLogs } from "@/lib/audit-log-query";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function toSafeCsvCell(value: unknown): string {
    const text = String(value ?? "");
    const guarded = FORMULA_PREFIXES.some((prefix) =>
        text.startsWith(prefix),
    )
        ? `'${text}`
        : text;
    return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { serverId } = await params;
        const { databases } = getServerClient();
        const env = getEnvConfig();

        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageServer) {
            return returnForbidden();
        }

        const { searchParams } = new URL(request.url);
        const format = searchParams.get("format") || "json";

        const logs = await fetchAuditLogs({
            databases,
            databaseId: env.databaseId,
            auditCollectionId: env.collections.audit,
            profilesCollectionId: env.collections.profiles,
            serverId,
            limit: 1000,
        });

        if (format === "csv") {
            // Generate CSV
            const headers = [
                "Timestamp",
                "Action",
                "Moderator ID",
                "Moderator Name",
                "Target User ID",
                "Target User Name",
                "Reason",
                "Details",
            ];
            const rows = logs.map((log) => [
                log.timestamp,
                log.action,
                log.moderatorId,
                log.moderatorName || "",
                log.targetUserId || "",
                log.targetUserName || "",
                log.reason || "",
                log.details || "",
            ]);

            const csvContent = [
                headers.join(","),
                ...rows.map((row) =>
                    row.map((cell) => toSafeCsvCell(cell)).join(","),
                ),
            ].join("\n");

            return new NextResponse(csvContent, {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="audit-logs-${serverId}-${new Date().toISOString().split("T")[0]}.csv"`,
                },
            });
        }

        // Default to JSON
        const jsonContent = JSON.stringify(logs, null, 2);
        return new NextResponse(jsonContent, {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="audit-logs-${serverId}-${new Date().toISOString().split("T")[0]}.json"`,
            },
        });
    } catch (error) {
        logger.error("Error exporting audit logs", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to export audit logs" },
            { status: 500 },
        );
    }
}
