import { redirect } from "next/navigation";

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
		<main className="mx-auto max-w-5xl space-y-6 p-6">
			<header className="space-y-1">
				<h1 className="font-semibold text-2xl">Audit Log</h1>
				<p className="text-muted-foreground text-sm">
					System moderation actions record.
				</p>
			</header>
			<section>
				<form className="mb-4 flex flex-wrap items-end gap-3" method="get">
					<div className="flex flex-col">
						<label className="font-medium text-xs" htmlFor="action">
							Action
						</label>
						<input
							className="rounded border px-2 py-1 text-sm"
							defaultValue={action || ""}
							id="action"
							name="action"
						/>
					</div>
					<div className="flex flex-col">
						<label className="font-medium text-xs" htmlFor="actorId">
							Actor
						</label>
						<input
							className="rounded border px-2 py-1 text-sm"
							defaultValue={actorId || ""}
							id="actorId"
							name="actorId"
						/>
					</div>
					<div className="flex flex-col">
						<label className="font-medium text-xs" htmlFor="targetId">
							Target
						</label>
						<input
							className="rounded border px-2 py-1 text-sm"
							defaultValue={targetId || ""}
							id="targetId"
							name="targetId"
						/>
					</div>
					<div className="flex flex-col">
						<label className="font-medium text-xs" htmlFor="limit">
							Limit
						</label>
						<input
							className="w-24 rounded border px-2 py-1 text-sm"
							defaultValue={limit}
							id="limit"
							max={200}
							min={1}
							name="limit"
							type="number"
						/>
					</div>
					<button className="rounded border px-3 py-1 text-sm" type="submit">
						Apply
					</button>
				</form>
				<div className="divide-y rounded border">
					{items.map(
						(a: {
							$id: string;
							action: string;
							targetId: string;
							actorId: string;
							$createdAt: string;
						}) => (
							<div className="p-3 text-sm" key={a.$id}>
								<div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
									<span>ID: {a.$id}</span>
									<span>Action: {a.action}</span>
									<span>Actor: {a.actorId}</span>
									<span>Target: {a.targetId}</span>
									<span>{new Date(a.$createdAt).toLocaleString()}</span>
								</div>
							</div>
						),
					)}
					{items.length === 0 && (
						<p className="p-4 text-muted-foreground text-sm">
							No audit events.
						</p>
					)}
				</div>
				{nextCursor && (
					<form className="mt-4" method="get">
						<input name="cursor" type="hidden" value={nextCursor} />
						<input name="limit" type="hidden" value={limit} />
						{action && <input name="action" type="hidden" value={action} />}
						{actorId && <input name="actorId" type="hidden" value={actorId} />}
						{targetId && (
							<input name="targetId" type="hidden" value={targetId} />
						)}
						<button className="rounded border px-3 py-1 text-sm" type="submit">
							Next
						</button>
					</form>
				)}
			</section>
		</main>
	);
}
