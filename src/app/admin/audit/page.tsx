import { redirect } from "next/navigation";
import { Filter, ListTree } from "lucide-react";

import { adminListAuditEvents } from "@/lib/appwrite-audit";
import { requireAdmin } from "@/lib/auth-server";

const DEFAULT_AUDIT_LIMIT = 50;

export default async function AuditPage(props: {
	searchParams?: Promise<Record<string, string | string[]>>;
}) {
	// Middleware ensures auth; this double-checks admin role
	await requireAdmin().catch(() => {
		redirect("/");
	});
	
	// Await searchParams as required by Next.js 15
	const searchParams = await props.searchParams;
	
	const limit = Number(searchParams?.limit) || DEFAULT_AUDIT_LIMIT;
	const cursor =
		typeof searchParams?.cursor === "string" ? searchParams?.cursor : undefined;
	const action =
		typeof searchParams?.action === "string" ? searchParams?.action : undefined;
	const actorId =
		typeof searchParams?.actorId === "string"
			? searchParams?.actorId
			: undefined;
	const targetId =
		typeof searchParams?.targetId === "string"
			? searchParams?.targetId
			: undefined;
	const { items, nextCursor } = await adminListAuditEvents({
		limit,
		cursorAfter: cursor,
		action,
		actorId,
		targetId,
	});
	return (
		<main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
			<section className="rounded-3xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="space-y-2">
						<h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
						<p className="max-w-xl text-sm text-muted-foreground">
							Every privileged action flowing through Firepit lands here. Filter by actor, target, or action to trace ground truth fast.
						</p>
					</div>
					<div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
						<div className="flex items-center gap-2 font-semibold uppercase tracking-wide">
							<ListTree className="h-4 w-4" />
							<span>Results capped</span>
						</div>
						<p className="mt-2 leading-relaxed">
							Showing up to {limit} events at a time. Paginate forward for the next slice.
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
						<label className="font-medium text-xs uppercase tracking-wide text-muted-foreground" htmlFor="action">
							Action
						</label>
						<input
							className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={action || ""}
							id="action"
							name="action"
							placeholder="suspend.user"
						/>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-xs uppercase tracking-wide text-muted-foreground" htmlFor="actorId">
							Actor ID
						</label>
						<input
							className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={actorId || ""}
							id="actorId"
							name="actorId"
							placeholder="user_..."
						/>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-xs uppercase tracking-wide text-muted-foreground" htmlFor="targetId">
							Target ID
						</label>
						<input
							className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={targetId || ""}
							id="targetId"
							name="targetId"
							placeholder="resource_..."
						/>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-xs uppercase tracking-wide text-muted-foreground" htmlFor="limit">
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
							href="/admin/audit"
						>
							Reset
						</a>
					</div>
				</form>
			</section>

			<section className="space-y-4">
				<h2 className="text-lg font-semibold">Recent activity</h2>
				<div className="rounded-3xl border border-border/60 bg-card/70">
					{items.map(
						(a: {
							$id: string;
							action: string;
							targetId: string;
							actorId: string;
							$createdAt: string;
						}) => (
							<article className="border-b border-border/60 px-5 py-4 text-sm last:border-b-0" key={a.$id}>
								<div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									<span>{new Date(a.$createdAt).toLocaleString()}</span>
									<span className="rounded-full bg-muted/60 px-2 py-1 text-[11px] text-foreground">
										{a.action}
									</span>
								</div>
								<dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
									<div>
										<dt className="font-semibold text-foreground">Event ID</dt>
										<dd className="mt-1 break-all font-mono text-[11px]">{a.$id}</dd>
									</div>
									<div>
										<dt className="font-semibold text-foreground">Actor</dt>
										<dd className="mt-1 break-all font-mono text-[11px]">{a.actorId}</dd>
									</div>
									<div>
										<dt className="font-semibold text-foreground">Target</dt>
										<dd className="mt-1 break-all font-mono text-[11px]">{a.targetId}</dd>
									</div>
								</dl>
							</article>
						),
					)}
					{items.length === 0 && (
						<p className="px-5 py-6 text-sm text-muted-foreground">
							No audit events found for this query.
						</p>
					)}
				</div>
				{nextCursor && (
					<form className="flex justify-center" method="get">
						<input name="cursor" type="hidden" value={nextCursor} />
						<input name="limit" type="hidden" value={limit} />
						{action && <input name="action" type="hidden" value={action} />}
						{actorId && <input name="actorId" type="hidden" value={actorId} />}
						{targetId && (
							<input name="targetId" type="hidden" value={targetId} />
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
