import { redirect } from "next/navigation";
import { Filter, Hash, MessageSquare, Server, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
	getBasicStats,
	listAllChannelsPage,
	listAllServersPage,
	listGlobalMessages,
} from "@/lib/appwrite-admin";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import { requireModerator } from "@/lib/auth-server";
import { ModerationMessageList } from "./ModerationMessageList";

// server component file; no client side hooks required

type ModerationSearchParams = {
	limit: number;
	includeRemoved: boolean;
	onlyRemoved: boolean;
	userFilter?: string;
	channelFilter?: string;
	channelIdsFilter?: string[];
	serverFilter?: string;
	onlyMissingServerId?: boolean; // Added to the type definition
	textFilter?: string;
	cursor?: string;
};

function parseModerationParams(
	searchParams?: Record<string, string | string[]>,
): ModerationSearchParams {
	const defaultModerationLimit = 30;
	const limit = Number(searchParams?.limit) || defaultModerationLimit;
	return {
		limit,
		includeRemoved: searchParams?.includeRemoved === "true",
		onlyRemoved: searchParams?.onlyRemoved === "true",
		userFilter:
			typeof searchParams?.userId === "string"
				? searchParams?.userId
				: undefined,
		channelFilter:
			typeof searchParams?.channelId === "string"
				? searchParams?.channelId
				: undefined,
		channelIdsFilter: (() => {
			const raw = searchParams?.channelIds;
			if (!raw) {
				return;
			}
			if (Array.isArray(raw)) {
				return raw.filter(
					(v): v is string => typeof v === "string" && v.trim().length > 0,
				);
			}
			if (typeof raw === "string") {
				return raw
					.split(",")
					.map((p) => p.trim())
					.filter((p) => p.length > 0);
			}
		})(),
		serverFilter:
			typeof searchParams?.serverId === "string"
				? searchParams?.serverId
				: undefined,
		onlyMissingServerId: searchParams?.onlyMissingServerId === "true",
		textFilter:
			typeof searchParams?.q === "string" ? searchParams?.q : undefined,
		cursor:
			typeof searchParams?.cursor === "string"
				? searchParams?.cursor
				: undefined,
	};
}

const CHANNEL_PAGE_SCAN_LIMIT = 3; // safety cap on pages
const SERVER_PAGE_SCAN_LIMIT = 3; // safety cap on pages

async function getAllServers() {
	const collected: { $id: string; name: string }[] = [];
	let cursor: string | undefined;
	const pageLimit = 100;
	for (let i = 0; i < SERVER_PAGE_SCAN_LIMIT; i += 1) {
		const page = await listAllServersPage(pageLimit, cursor);
		collected.push(
			...page.items.map((s) => ({ $id: s.$id, name: s.name || "Unnamed Server" })),
		);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
	}
	return collected;
}

async function getServerChannels(serverId: string | undefined) {
	if (!serverId) {
		return [] as { $id: string; name: string }[];
	}
	const collected: { $id: string; name: string }[] = [];
	let cursor: string | undefined;
	const pageLimit = 100;
	for (let i = 0; i < CHANNEL_PAGE_SCAN_LIMIT; i += 1) {
		const page = await listAllChannelsPage(serverId, pageLimit, cursor);
		collected.push(
			...page.items.map((c) => ({ $id: c.$id, name: c.name || "" })),
		);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
	}
	return collected;
}

function buildFetchInput(params: ModerationSearchParams) {
	return {
		limit: params.limit,
		cursorAfter: params.cursor,
		includeRemoved: params.includeRemoved,
		onlyRemoved: params.onlyRemoved,
		userId: params.userFilter,
		channelId: params.channelIdsFilter?.length
			? undefined
			: params.channelFilter,
		channelIds: params.channelIdsFilter,
		serverId: params.serverFilter,
		onlyMissingServerId: params.onlyMissingServerId,
		text: params.textFilter,
	};
}

async function buildBadgeMapSimple(
	docs: { userId?: string; removedBy?: string }[],
) {
	const map: Record<string, string[]> = {};
	const ids = new Set<string>();
	for (const d of docs) {
		if (d.userId) {
			ids.add(d.userId);
		}
		if (d.removedBy) {
			ids.add(d.removedBy);
		}
	}
	for (const id of ids) {
		const info = await getUserRoleTags(id);
		map[id] = info.tags.map((t) => t.label);
	}
	return map;
}

type ModerationMessage = {
	$id: string;
	removedAt?: string;
	removedBy?: string;
	serverId?: string;
	channelId?: string;
	text?: string;
	userId?: string;
};

export default async function ModerationPage(props: {
	searchParams?: Promise<Record<string, string | string[]>>;
}) {
	// Await searchParams as required by Next.js 15
	const searchParams = await props.searchParams;
	
	// Middleware ensures auth; this double-checks moderator role
	const { roles } = await requireModerator().catch(() => {
		redirect("/");
	});
	const isAdmin = roles.isAdmin;
	const params = parseModerationParams(searchParams);
	const fetchMsgInput = buildFetchInput(params);
	const data = await fetchModerationData(fetchMsgInput, params.serverFilter);
	const documents = data.messages.items as unknown as ModerationMessage[];
	const nextCursor = data.messages.nextCursor || undefined;
	const badgeMap = await buildBadgeMapSimple(documents);
	return (
		<main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
			<Header />
			<StatsGrid stats={data.stats} />
			<FilterForm 
				params={params} 
				serverChannels={data.channels}
				servers={data.servers}
			/>
			<MessagesList
				badgeMap={badgeMap}
				documents={documents}
				nextCursor={nextCursor}
				params={params}
				isAdmin={isAdmin}
			/>
		</main>
	);
}

async function fetchModerationData(
	fetchMsgInput: ReturnType<typeof buildFetchInput>,
	serverFilter?: string,
) {
	const [messages, stats, channels, servers] = await Promise.all([
		listGlobalMessages(fetchMsgInput),
		getBasicStats(),
		getServerChannels(serverFilter),
		getAllServers(),
	]);
	return { messages, stats, channels, servers };
}

function Header() {
	return (
		<header className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur">
			<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<div className="space-y-3">
					<div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						<ShieldAlert className="h-4 w-4" aria-hidden="true" />
						Live moderation tools
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">Moderation panel</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						Sweep messages across every server in seconds. Apply filters, jump into context, and take action without leaving this workspace.
					</p>
				</div>
				<div className="rounded-3xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
					<p className="font-semibold text-foreground">Need quicker pivots?</p>
					<p className="mt-2 leading-relaxed">
						Select a server to unlock channel filtering and narrow results instantly.
					</p>
				</div>
			</div>
		</header>
	);
}

function StatsGrid({
	stats,
}: {
	stats: Awaited<ReturnType<typeof getBasicStats>>;
}) {
	const items = [
		{
			label: "Servers monitored",
			value: stats.servers,
			icon: <Server className="h-5 w-5" aria-hidden="true" />,
		},
		{
			label: "Channels tracked",
			value: stats.channels,
			icon: <Hash className="h-5 w-5" aria-hidden="true" />,
		},
		{
			label: "Messages indexed",
			value: stats.messages,
			icon: <MessageSquare className="h-5 w-5" aria-hidden="true" />,
		},
	];
	return (
		<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{items.map((item) => (
				<StatBox key={item.label} icon={item.icon} label={item.label} value={item.value} />
			))}
		</section>
	);
}


function StatBox({
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

function FilterForm({
	params,
	serverChannels,
	servers,
}: {
	params: ModerationSearchParams;
	serverChannels: { $id: string; name: string }[];
	servers: { $id: string; name: string }[];
}) {
	const multiChannels = serverChannels.length > 0;
	return (
		<section className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-lg">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<Filter className="h-4 w-4" aria-hidden="true" />
				<span>Refine results</span>
			</div>
			<form className="mt-6 space-y-6" method="get">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="q">
							Search message content
						</label>
						<input
							className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.textFilter || ""}
							id="q"
							name="q"
							placeholder="Keyword or phrase"
							type="text"
						/>
					</div>
					<div className="space-y-2">
						<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="userId">
							User ID <span className="text-muted-foreground">(optional)</span>
						</label>
						<input
							className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.userFilter || ""}
							id="userId"
							name="userId"
							placeholder="user_..."
							type="text"
						/>
					</div>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					{servers.length > 0 ? (
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="serverId">
								Server
							</label>
							<select
								className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.serverFilter || ""}
								id="serverId"
								name="serverId"
							>
								<option value="">All servers</option>
								{servers.map((s) => (
									<option key={s.$id} value={s.$id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
					) : (
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="serverId">
								Server ID <span className="text-muted-foreground">(optional)</span>
							</label>
							<input
								className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.serverFilter || ""}
								id="serverId"
								name="serverId"
								placeholder="server_..."
								type="text"
							/>
						</div>
					)}
					{multiChannels ? (
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="channelIds">
								Channels <span className="text-muted-foreground text-[11px]">(Ctrl/Cmd+Click for multiple)</span>
							</label>
							<select
								className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.channelIdsFilter || []}
								id="channelIds"
								multiple
								name="channelIds"
								size={4}
								title="Hold Ctrl/Cmd to select multiple channels"
							>
								{serverChannels.map((c) => (
									<option key={c.$id} value={c.$id}>
										{c.name}
									</option>
								))}
							</select>
						</div>
					) : (
						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="channelId">
								Channel ID <span className="text-muted-foreground">(optional)</span>
							</label>
							<input
								className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.channelFilter || ""}
								id="channelId"
								name="channelId"
								placeholder="channel_..."
								type="text"
							/>
						</div>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-6">
					<label className="inline-flex items-center gap-2 text-sm" htmlFor="includeRemoved">
						<input
							className="h-4 w-4 rounded border-border/60 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultChecked={params.includeRemoved}
							id="includeRemoved"
							name="includeRemoved"
							type="checkbox"
							value="true"
						/>
						<span>Include removed</span>
					</label>
					<label className="inline-flex items-center gap-2 text-sm" htmlFor="onlyRemoved">
						<input
							className="h-4 w-4 rounded border-border/60 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultChecked={params.onlyRemoved}
							id="onlyRemoved"
							name="onlyRemoved"
							type="checkbox"
							value="true"
						/>
						<span>Only removed</span>
					</label>
					<div className="space-y-2">
						<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="limit">
							Results limit
						</label>
						<input
							className="w-24 rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.limit}
							id="limit"
							max={100}
							min={1}
							name="limit"
							type="number"
						/>
					</div>
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						className="rounded-2xl border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
						type="submit"
					>
						Apply filters
					</button>
					<a
						className="rounded-2xl border border-border/60 bg-muted/50 px-5 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
						href="/moderation"
					>
						Clear all
					</a>
				</div>
			</form>
		</section>
	);
}

function MessagesList({
	documents,
	badgeMap,
	params,
	nextCursor,
	isAdmin,
}: {
	documents: ModerationMessage[];
	badgeMap: Record<string, string[]>;
	params: ModerationSearchParams;
	nextCursor?: string;
	isAdmin: boolean;
}) {
	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Messages</h2>
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{documents.length} result{documents.length === 1 ? "" : "s"}
				</span>
			</div>
			<div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-inner">
				<ModerationMessageList
					badgeMap={badgeMap}
					initialMessages={documents}
					isAdmin={isAdmin}
				/>
			</div>
			<Pagination nextCursor={nextCursor} params={params} />
		</section>
	);
}

function Pagination({
	params,
	nextCursor,
}: {
	params: ModerationSearchParams;
	nextCursor?: string;
}) {
	if (!nextCursor) {
		return null;
	}
	return (
		<div className="flex justify-center pt-6">
			<form className="inline-flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-border/60 bg-card/70 px-6 py-4 shadow-sm" method="get">
				<input name="cursor" type="hidden" value={nextCursor} />
				<input name="limit" type="hidden" value={params.limit} />
				{params.includeRemoved && (
					<input name="includeRemoved" type="hidden" value="true" />
				)}
				{params.onlyRemoved && (
					<input name="onlyRemoved" type="hidden" value="true" />
				)}
				{params.userFilter && (
					<input name="userId" type="hidden" value={params.userFilter} />
				)}
				{params.channelFilter && !params.channelIdsFilter?.length && (
					<input name="channelId" type="hidden" value={params.channelFilter} />
				)}
				{params.channelIdsFilter?.map((cid) => (
					<input key={cid} name="channelIds" type="hidden" value={cid} />
				))}
				{params.serverFilter && (
					<input name="serverId" type="hidden" value={params.serverFilter} />
				)}
				{params.onlyMissingServerId && (
					<input name="onlyMissingServerId" type="hidden" value="true" />
				)}
				{params.textFilter && (
					<input name="q" type="hidden" value={params.textFilter} />
				)}
				<button 
					className="rounded-2xl border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40" 
					type="submit"
				>
					Load more messages
				</button>
			</form>
		</div>
	);
}
