import Link from "next/link";
import { redirect } from "next/navigation";

import { getBasicStats } from "@/lib/appwrite-admin";
import { requireAdmin } from "@/lib/auth-server";

import { type BackfillResult, backfillServerIds } from "./actions";
import { ServerManagement } from "./server-management";

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
		<main className="mx-auto max-w-6xl space-y-6 p-6">
			<header className="space-y-1">
				<h1 className="font-semibold text-2xl">Admin Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Infrastructure level overview & management tools.
				</p>
			</header>
			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<div className="rounded border bg-card p-4">
					<h2 className="mb-2 font-medium text-sm">Servers</h2>
					<p className="font-semibold text-2xl">{stats.servers}</p>
				</div>
				<div className="rounded border bg-card p-4">
					<h2 className="mb-2 font-medium text-sm">Channels</h2>
					<p className="font-semibold text-2xl">{stats.channels}</p>
				</div>
				<div className="rounded border bg-card p-4">
					<h2 className="mb-2 font-medium text-sm">Messages</h2>
					<p className="font-semibold text-2xl">{stats.messages}</p>
				</div>
			</section>

			{/* Server & Channel Management */}
			<ServerManagement
				isAdmin={roles.isAdmin}
				isModerator={roles.isModerator}
			/>

			<section className="space-y-4">
				<h2 className="font-medium text-lg">Panels</h2>
				<ul className="list-disc space-y-1 pl-5 text-sm">
					<li>
						<Link className="underline" href="/moderation">
							Go to Moderation Panel
						</Link>
					</li>
					<li>
						<Link className="underline" href="/admin/audit">
							Audit Log
						</Link>
					</li>
				</ul>
				<form className="mt-4 space-y-2" method="get">
					<input name="backfill" type="hidden" value="1" />
					<button className="rounded border px-3 py-1 text-sm" type="submit">
						Backfill Server IDs
					</button>
				</form>
				{backfill && (
					<p className="text-muted-foreground text-xs">
						Backfill updated {backfill.updated} / scanned {backfill.scanned}{" "}
						(remaining est {backfill.remaining}).
					</p>
				)}
			</section>
		</main>
	);
}
