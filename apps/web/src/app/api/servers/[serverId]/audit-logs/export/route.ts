import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

interface AuditLog {
    timestamp: string;
    action: string;
    moderatorId: string;
    moderatorName?: string;
    targetUserId?: string;
    targetUserName?: string;
    reason?: string;
    details?: string;
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
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const format = searchParams.get("format") || "json";

        // Fetch audit logs from the regular endpoint
        const logsResponse = await fetch(
            `${request.url.split("/export")[0]}?limit=1000`,
            {
                headers: request.headers,
            },
        );

        if (!logsResponse.ok) {
            return NextResponse.json(
                { error: "Failed to fetch audit logs" },
                { status: 500 },
            );
        }

        const logs = await logsResponse.json();

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
            const rows = (logs as AuditLog[]).map((log) => [
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
                ...rows.map((row: string[]) =>
                    row
                        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                        .join(","),
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
