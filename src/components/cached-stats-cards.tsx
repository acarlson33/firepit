"use cache";

import { Database, Hash, MessageSquare } from "lucide-react";
import { getCachedBasicStats } from "@/lib/cached-data";

/**
 * Cached server component for displaying basic stats
 * Stats computation is expensive and cached for better performance
 */
export async function CachedStatsCards() {
	const stats = await getCachedBasicStats();

	return (
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
	);
}

function StatCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
}) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-6 shadow-lg backdrop-blur transition hover:border-foreground/20">
			<div className="flex items-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
					{icon}
				</div>
				<div className="flex-1">
					<p className="font-semibold text-2xl tabular-nums">{value.toLocaleString()}</p>
					<p className="text-muted-foreground text-xs">{label}</p>
				</div>
			</div>
		</div>
	);
}
