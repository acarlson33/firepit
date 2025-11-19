import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, Hash, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

import { getBasicStats } from "@/lib/appwrite-admin";
import { requireAdmin } from "@/lib/auth-server";

import { type BackfillResult, backfillServerIds } from "./actions";
import { ServerManagement } from "./server-management";
import { VersionCheck } from "./version-check";
import { FeatureFlags } from "./feature-flags";

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
	if (searchParams?.backfill === "1" && user) {
		try {
			backfill = await backfillServerIds(user.$id);
		} catch {
			backfill = null;
		}
	}
	return (
		<main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
			<section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur">
				<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
					<div className="space-y-3">
						<h1 className="text-3xl font-semibold tracking-tight">Admin control room</h1>
						<p className="max-w-xl text-sm text-muted-foreground">
							Monitor the health of your Firepit workspace, keep servers tidy, and jump into specialist panels when you need deeper insight.
						</p>
						<div className="inline-flex items-center gap-2 rounded-full bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							<span>Role</span>
							<span className="text-foreground">{roles.isAdmin ? "Administrator" : "Elevated"}</span>
						</div>
					</div>
					<div className="grid gap-3 text-sm">
						<p className="font-semibold text-muted-foreground uppercase tracking-wide">
							Quick links
						</p>
						<div className="grid gap-2">
							<Link
								className="inline-flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-foreground/40"
								href="/moderation"
							>
								<span>Open Moderation Panel</span>
								<span aria-hidden="true">→</span>
							</Link>
							<Link
								className="inline-flex items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-foreground/40"
								href="/admin/audit"
							>
								<span>View Audit Log</span>
								<span aria-hidden="true">→</span>
							</Link>
						</div>
					</div>
				</div>
			</section>

			<VersionCheck />

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatCard icon={<Database className="h-5 w-5" />} label="Servers indexed" value={stats.servers} />
				<StatCard icon={<Hash className="h-5 w-5" />} label="Channels tracked" value={stats.channels} />
				<StatCard icon={<MessageSquare className="h-5 w-5" />} label="Messages stored" value={stats.messages} />
			</section>

			<FeatureFlags userId={user.$id} />

			<ServerManagement
				isAdmin={roles.isAdmin}
				isModerator={roles.isModerator}
			/>

			<section className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-lg font-semibold">Maintenance tools</h2>
						<p className="text-sm text-muted-foreground">
							Run backfills when you need to re-sync server metadata or patch historical IDs.
						</p>
					</div>
					<form className="flex flex-col gap-2 sm:flex-row sm:items-center" method="get">
						<input name="backfill" type="hidden" value="1" />
						<button
							className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
							type="submit"
						>
							<Database className="h-4 w-4" />
							Backfill server IDs
						</button>
					</form>
				</div>
				{backfill && (
					<p className="mt-4 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
						Backfill updated {backfill.updated} / scanned {backfill.scanned} (remaining est {backfill.remaining}).
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
	return (
		<div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
			<div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				<span>{label}</span>
				{icon}
			</div>
			<p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
		</div>
	);
}
