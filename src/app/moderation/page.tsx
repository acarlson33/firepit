import { redirect } from "next/navigation";
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
		<main className="mx-auto max-w-5xl space-y-6 p-6">
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
		<header className="space-y-1">
			<h1 className="font-semibold text-2xl">Moderation Panel</h1>
			<p className="text-muted-foreground text-sm">
				Review and manage messages across servers & channels. Use the filters below to narrow down your search - select a server from the dropdown to see its channels.
			</p>
		</header>
	);
}

function StatsGrid({
	stats,
}: {
	stats: Awaited<ReturnType<typeof getBasicStats>>;
}) {
	return (
		<section className="grid gap-4 sm:grid-cols-3">
			<StatBox label="Servers" value={stats.servers} />
			<StatBox label="Channels" value={stats.channels} />
			<StatBox label="Messages" value={stats.messages} />
		</section>
	);
}

function StatBox({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded border p-3">
			<p className="mb-1 font-medium text-xs">{label}</p>
			<p className="font-semibold text-lg">{value}</p>
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
		<section className="rounded-lg border bg-card p-6">
			<h2 className="mb-4 font-semibold text-lg">Filters</h2>
			<form className="space-y-4" method="get">
				{/* Search and User Filter Row */}
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<label className="font-medium text-sm" htmlFor="q">
							Search Message Content
						</label>
						<input
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.textFilter || ""}
							id="q"
							name="q"
							placeholder="Search messages..."
							type="text"
						/>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-sm" htmlFor="userId">
							User ID <span className="text-muted-foreground">(optional)</span>
						</label>
						<input
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.userFilter || ""}
							id="userId"
							name="userId"
							placeholder="Filter by user..."
							type="text"
						/>
					</div>
				</div>

				{/* Server and Channel Row */}
				<div className="grid gap-4 md:grid-cols-2">
					{servers.length > 0 ? (
						<div className="space-y-2">
							<label className="font-medium text-sm" htmlFor="serverId">
								Server
							</label>
							<select
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.serverFilter || ""}
								id="serverId"
								name="serverId"
							>
								<option value="">All Servers</option>
								{servers.map((s) => (
									<option key={s.$id} value={s.$id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
					) : (
						<div className="space-y-2">
							<label className="font-medium text-sm" htmlFor="serverId">
								Server ID <span className="text-muted-foreground">(optional)</span>
							</label>
							<input
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.serverFilter || ""}
								id="serverId"
								name="serverId"
								placeholder="Enter server ID..."
								type="text"
							/>
						</div>
					)}
					{multiChannels ? (
						<div className="space-y-2">
							<label className="font-medium text-sm" htmlFor="channelIds">
								Channels <span className="text-muted-foreground text-xs">(Ctrl/Cmd+Click for multiple)</span>
							</label>
							<select
								className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
							<label className="font-medium text-sm" htmlFor="channelId">
								Channel ID <span className="text-muted-foreground">(optional)</span>
							</label>
							<input
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								defaultValue={params.channelFilter || ""}
								id="channelId"
								name="channelId"
								placeholder="Enter channel ID..."
								type="text"
							/>
						</div>
					)}
				</div>

				{/* Filter Options Row */}
				<div className="flex flex-wrap items-center gap-6">
					<div className="flex items-center space-x-2">
						<input
							className="h-4 w-4 rounded border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultChecked={params.includeRemoved}
							id="includeRemoved"
							name="includeRemoved"
							type="checkbox"
							value="true"
						/>
						<label className="text-sm leading-none" htmlFor="includeRemoved">
							Include Removed Messages
						</label>
					</div>
					<div className="flex items-center space-x-2">
						<input
							className="h-4 w-4 rounded border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultChecked={params.onlyRemoved}
							id="onlyRemoved"
							name="onlyRemoved"
							type="checkbox"
							value="true"
						/>
						<label className="text-sm leading-none" htmlFor="onlyRemoved">
							Only Removed Messages
						</label>
					</div>
					<div className="space-y-2">
						<label className="font-medium text-sm" htmlFor="limit">
							Results Limit
						</label>
						<input
							className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							defaultValue={params.limit}
							id="limit"
							max={100}
							min={1}
							name="limit"
							type="number"
						/>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-3 pt-2">
					<button
						className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						type="submit"
					>
						Apply Filters
					</button>
					<a
						className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						href="/moderation"
					>
						Clear All
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
			<h2 className="font-semibold text-lg">Messages</h2>
			<ModerationMessageList
				badgeMap={badgeMap}
				initialMessages={documents}
				isAdmin={isAdmin}
			/>
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
		<div className="flex justify-center pt-4">
			<form method="get">
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
					className="rounded-md border border-input bg-background px-6 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
					type="submit"
				>
					Load More Messages
				</button>
			</form>
		</div>
	);
}
