import { redirect } from "next/navigation";
import Link from "next/link";
import { Filter, Flag } from "lucide-react";

import { listReports, getPendingReportCount } from "@/lib/appwrite-reports";
import {
    getProfilesByUserIds,
    resolveProfileUserId,
} from "@/lib/appwrite-profiles";
import { requireAdmin } from "@/lib/auth-server";
import { getAuditUserLabel } from "@/components/server-admin-panel-utils";
import { Badge } from "@/components/ui/badge";
import { actionResolveReportBound, actionDismissReportBound } from "./actions";

const DEFAULT_LIMIT = 50;

function statusVariant(status: string) {
    switch (status) {
        case "pending":
            return "default";
        case "resolved":
            return "secondary";
        case "dismissed":
            return "outline";
        default:
            return "outline";
    }
}

export default async function ReportsPage(props: {
    searchParams?: Promise<Record<string, string | string[]>>;
}) {
    await requireAdmin().catch(() => {
        redirect("/");
    });

    const searchParams = await props.searchParams;

    const limit = Number(searchParams?.limit) || DEFAULT_LIMIT;
    const cursor =
        typeof searchParams?.cursor === "string"
            ? searchParams?.cursor
            : undefined;
    const status =
        typeof searchParams?.status === "string" &&
        ["pending", "resolved", "dismissed"].includes(searchParams.status)
            ? (searchParams.status as "pending" | "resolved" | "dismissed")
            : undefined;
    const reporterInput =
        typeof searchParams?.reporter === "string"
            ? searchParams.reporter
            : undefined;
    const reportedInput =
        typeof searchParams?.reported === "string"
            ? searchParams.reported
            : undefined;

    const resolvedReporterId = reporterInput
        ? ((await resolveProfileUserId(reporterInput)) ?? reporterInput)
        : undefined;
    const resolvedReportedId = reportedInput
        ? ((await resolveProfileUserId(reportedInput)) ?? reportedInput)
        : undefined;

    const [pendingCount, { items, nextCursor }] = await Promise.all([
        getPendingReportCount(),
        listReports({
            limit,
            cursorAfter: cursor,
            status,
            reporterId: resolvedReporterId,
            reportedUserId: resolvedReportedId,
        }),
    ]);

    const allUserIds = Array.from(
        new Set([
            ...items.map((r) => r.reporterId),
            ...items.map((r) => r.reportedUserId),
            ...items
                .map((r) => r.resolvedBy)
                .filter((id): id is string => Boolean(id)),
        ]),
    );
    const profilesByUserId = await getProfilesByUserIds(allUserIds);
    const userDisplayList = Array.from(profilesByUserId.values()).map(
        (profile) => ({
            userId: profile.userId,
            userName: profile.userName,
            displayName: profile.displayName,
        }),
    );

    function getUserLabel(userId?: string) {
        return getAuditUserLabel({
            defaultLabel: "Unknown user",
            members: userDisplayList,
            userId,
        });
    }

    return (
        <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
            <section className="rounded-3xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold tracking-tight">
                            User Reports
                        </h1>
                        <p className="max-w-xl text-sm text-muted-foreground">
                            Review and act on reports submitted by users for
                            inappropriate profile content.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 font-semibold uppercase tracking-wide">
                            <Flag className="h-4 w-4" />
                            <span>Pending</span>
                        </div>
                        <p className="mt-1 text-lg font-bold text-foreground">
                            {pendingCount}
                        </p>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Filter className="h-4 w-4" aria-hidden="true" />
                    <span>Refine results</span>
                </div>
                <form className="mt-4 grid gap-4 md:grid-cols-2" method="get">
                    <div className="space-y-2">
                        <label
                            className="font-medium text-xs uppercase tracking-wide text-muted-foreground"
                            htmlFor="status"
                        >
                            Status
                        </label>
                        <select
                            className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue={status || ""}
                            id="status"
                            name="status"
                        >
                            <option value="">All</option>
                            <option value="pending">Pending</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label
                            className="font-medium text-xs uppercase tracking-wide text-muted-foreground"
                            htmlFor="reporter"
                        >
                            Reporter
                        </label>
                        <input
                            className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue={reporterInput || ""}
                            id="reporter"
                            name="reporter"
                            placeholder="username or user ID"
                        />
                    </div>
                    <div className="space-y-2">
                        <label
                            className="font-medium text-xs uppercase tracking-wide text-muted-foreground"
                            htmlFor="reported"
                        >
                            Reported User
                        </label>
                        <input
                            className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue={reportedInput || ""}
                            id="reported"
                            name="reported"
                            placeholder="username or user ID"
                        />
                    </div>
                    <div className="space-y-2">
                        <label
                            className="font-medium text-xs uppercase tracking-wide text-muted-foreground"
                            htmlFor="limit"
                        >
                            Limit
                        </label>
                        <input
                            className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue={limit}
                            id="limit"
                            max={200}
                            min={1}
                            name="limit"
                            type="number"
                        />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap gap-3">
                        <button
                            className="rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                            type="submit"
                        >
                            Apply filters
                        </button>
                        <a
                            className="rounded-2xl border border-border/60 bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                            href="/admin/reports"
                        >
                            Reset
                        </a>
                    </div>
                </form>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold">Reports</h2>
                <div className="space-y-4">
                    {items.map((report) => {
                        const reporterLabel = getUserLabel(report.reporterId);
                        const reportedLabel = getUserLabel(
                            report.reportedUserId,
                        );
                        const resolverLabel = report.resolvedBy
                            ? getUserLabel(report.resolvedBy)
                            : null;

                        return (
                            <article
                                className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg"
                                key={report.$id}
                            >
                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <span>
                                        {new Date(
                                            report.$createdAt,
                                        ).toLocaleString()}
                                    </span>
                                    <Badge
                                        variant={statusVariant(report.status)}
                                    >
                                        {report.status}
                                    </Badge>
                                </div>

                                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                                    <div>
                                        <dt className="font-semibold text-foreground">
                                            Reported User
                                        </dt>
                                        <dd className="mt-1">
                                            <Link
                                                className="text-primary hover:underline"
                                                href={`/profile/${report.reportedUserId}`}
                                            >
                                                {reportedLabel}
                                            </Link>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="font-semibold text-foreground">
                                            Reporter
                                        </dt>
                                        <dd className="mt-1">
                                            <Link
                                                className="text-primary hover:underline"
                                                href={`/profile/${report.reporterId}`}
                                            >
                                                {reporterLabel}
                                            </Link>
                                        </dd>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <dt className="font-semibold text-foreground">
                                            Justification
                                        </dt>
                                        <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                            {report.justification}
                                        </dd>
                                    </div>
                                    {report.status !== "pending" && (
                                        <>
                                            <div>
                                                <dt className="font-semibold text-foreground">
                                                    Resolved by
                                                </dt>
                                                <dd className="mt-1 text-muted-foreground">
                                                    {resolverLabel}
                                                </dd>
                                            </div>
                                            {report.resolutionNotes && (
                                                <div>
                                                    <dt className="font-semibold text-foreground">
                                                        Resolution Notes
                                                    </dt>
                                                    <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                                        {report.resolutionNotes}
                                                    </dd>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </dl>

                                {report.status === "pending" && (
                                    <div className="mt-4 border-t border-border/60 pt-4">
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Take action
                                        </p>
                                        <div className="flex flex-wrap gap-4">
                                            <form
                                                action={
                                                    actionResolveReportBound
                                                }
                                                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                                            >
                                                <input
                                                    name="reportId"
                                                    type="hidden"
                                                    value={report.$id}
                                                />
                                                <div className="space-y-1">
                                                    <label
                                                        className="text-xs text-muted-foreground"
                                                        htmlFor={`notes-resolve-${report.$id}`}
                                                    >
                                                        Notes (optional)
                                                    </label>
                                                    <input
                                                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        id={`notes-resolve-${report.$id}`}
                                                        name="resolutionNotes"
                                                        placeholder="Resolution notes..."
                                                    />
                                                </div>
                                                <button
                                                    className="rounded-2xl border border-border/60 bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80"
                                                    type="submit"
                                                >
                                                    Resolve
                                                </button>
                                            </form>
                                            <form
                                                action={
                                                    actionDismissReportBound
                                                }
                                                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                                            >
                                                <input
                                                    name="reportId"
                                                    type="hidden"
                                                    value={report.$id}
                                                />
                                                <div className="space-y-1">
                                                    <label
                                                        className="text-xs text-muted-foreground"
                                                        htmlFor={`notes-dismiss-${report.$id}`}
                                                    >
                                                        Notes (optional)
                                                    </label>
                                                    <input
                                                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        id={`notes-dismiss-${report.$id}`}
                                                        name="resolutionNotes"
                                                        placeholder="Dismissal reason..."
                                                    />
                                                </div>
                                                <button
                                                    className="rounded-2xl border border-border/60 bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
                                                    type="submit"
                                                >
                                                    Dismiss
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}

                    {items.length === 0 && (
                        <div className="rounded-3xl border border-border/60 bg-card/70 px-5 py-6 text-sm text-muted-foreground">
                            No reports found for this query.
                        </div>
                    )}
                </div>

                {nextCursor && (
                    <form className="flex justify-center" method="get">
                        <input name="cursor" type="hidden" value={nextCursor} />
                        <input name="limit" type="hidden" value={limit} />
                        {status && (
                            <input name="status" type="hidden" value={status} />
                        )}
                        {reporterInput && (
                            <input
                                name="reporter"
                                type="hidden"
                                value={reporterInput}
                            />
                        )}
                        {reportedInput && (
                            <input
                                name="reported"
                                type="hidden"
                                value={reportedInput}
                            />
                        )}
                        <button
                            className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                            type="submit"
                        >
                            Load next {limit}
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
}
