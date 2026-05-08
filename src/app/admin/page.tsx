import Link from "next/link";
import { redirect } from "next/navigation";
import {
    ArrowRight,
    Database,
    Hash,
    MessageSquare,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { createHash } from "node:crypto";

import { getBasicStats } from "@/lib/appwrite-admin";
import { requireAdmin } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";

import { type BackfillResult, backfillServerIds } from "./actions";
import { ServerManagement } from "./server-management";
import { VersionCheck } from "./version-check";
import { FeatureFlags } from "./feature-flags";
import { AnnouncementPanel } from "./announcement-panel";

const quickLinkClassName =
    "inline-flex items-center justify-between rounded-3xl border border-border/60 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-border hover:bg-background";

const ADMIN_QUICK_LINKS = [
    {
        href: "/moderation",
        label: "Open Moderation Panel",
    },
    {
        href: "/admin/audit",
        label: "View Audit Log",
    },
    {
        href: "/admin/preset-frames",
        label: "Manage Preset Frame Assets",
    },
    {
        href: "/admin/reports",
        label: "Review User Reports",
    },
] as const;

export default async function AdminPage(props: {
    searchParams?: Promise<Record<string, string | string[]>>;
}) {
    // Await searchParams as required by Next.js 15
    const searchParams = await props.searchParams;

    // Middleware ensures auth; this double-checks admin role
    const { user, roles } = await requireAdmin().catch(() => {
        redirect("/");
    });
    const stats = await getBasicStats();
    let backfill: BackfillResult | null = null;
    let backfillError: string | null = null;
    const backfillParam = searchParams?.backfill;
    const shouldRunBackfill = Array.isArray(backfillParam)
        ? backfillParam.includes("1")
        : backfillParam === "1";

    if (shouldRunBackfill) {
        try {
            backfill = await backfillServerIds(user.$id);
        } catch (error) {
            const userIdHash = createHash("sha256")
                .update(user.$id)
                .digest("hex")
                .slice(0, 16);
            logger.error("backfillServerIds failed", {
                error: error instanceof Error ? error.message : String(error),
                userIdHash,
            });
            backfillError = "Backfill failed. Check server logs for details.";
        }
    }
    return (
        <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
            <section className="grid gap-6 overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Control room
                    </div>
                    <div className="space-y-4">
                        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                            Admin control room for workspace operators.
                        </h1>
                        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                            Monitor the health of your Firepit workspace, keep
                            servers tidy, and jump into specialist panels when
                            you need deeper insight.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button asChild className="rounded-full shadow-lg shadow-primary/15">
                            <Link href="/moderation">
                                Open moderation
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button
                            asChild
                            className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                            variant="outline"
                        >
                            <Link href="/admin/audit">Open audit log</Link>
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Role
                            </p>
                            <p className="mt-2 text-sm text-foreground">
                                {roles.isAdmin ? "Administrator" : "Elevated"}
                            </p>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Coverage
                            </p>
                            <p className="mt-2 text-sm text-foreground">
                                Servers, moderation, and reporting
                            </p>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Flow
                            </p>
                            <p className="mt-2 text-sm text-foreground">
                                Jump between tools without losing context
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Quick links
                    </div>
                    <div className="grid gap-2">
                        {ADMIN_QUICK_LINKS.map((link) => (
                            <Link
                                className={quickLinkClassName}
                                href={link.href}
                                key={link.href}
                            >
                                <span>{link.label}</span>
                                <span aria-hidden="true">→</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <VersionCheck />

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    icon={<Database className="h-5 w-5" />}
                    label="Servers indexed"
                    value={stats.servers}
                />
                <StatCard
                    icon={<Hash className="h-5 w-5" />}
                    label="Channels tracked"
                    value={stats.channels}
                />
                <StatCard
                    icon={<MessageSquare className="h-5 w-5" />}
                    label="Messages stored"
                    value={stats.messages}
                />
            </section>

            <FeatureFlags userId={user.$id} />

            <AnnouncementPanel userId={user.$id} />

            <ServerManagement
                isAdmin={roles.isAdmin}
                isModerator={roles.isModerator}
            />

            <section className="overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            <Database className="h-3.5 w-3.5 text-primary" />
                            Maintenance tools
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Re-sync and repair workspace metadata.
                        </h2>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                            Run backfills when you need to re-sync server
                            metadata or patch historical IDs.
                        </p>
                    </div>
                    <form
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                        method="get"
                    >
                        <input name="backfill" type="hidden" value="1" />
                        <button
                            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                            type="submit"
                        >
                            <Database className="h-4 w-4" />
                            Backfill server IDs
                        </button>
                    </form>
                </div>
                {backfill && (
                    <p className="mt-4 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                        Backfill updated {backfill.updated} / scanned{" "}
                        {backfill.scanned} (skipped this batch{" "}
                        {backfill.skipped};{" "}
                        {backfill.hasMore
                            ? "more batches likely"
                            : "no additional batch detected"}
                        ).
                    </p>
                )}
                {backfillError && (
                    <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                        {backfillError}
                    </p>
                )}
            </section>
        </main>
    );
}

function StatCard({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: number;
}) {
    const formattedValue = Number.isFinite(value)
        ? value.toLocaleString()
        : String(value);

    return (
        <div className="rounded-4xl border border-border/60 bg-background/70 p-5 shadow-lg">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{label}</span>
                <span className="rounded-full border border-border/50 bg-card/70 p-2 text-foreground">
                    {icon}
                </span>
            </div>
            <p className="mt-4 text-3xl font-semibold text-foreground">
                {formattedValue}
            </p>
        </div>
    );
}
