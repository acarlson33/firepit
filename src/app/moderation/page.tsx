import { redirect } from "next/navigation";
import {
	getBasicStats,
	listAllChannelsPage,
	listGlobalMessages,
} from "@/lib/appwrite-admin";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import { requireModerator } from "@/lib/auth-server";
import { actionHardDelete, actionRestore, actionSoftDelete } from "./actions";

// server component file; no client side hooks required

// Helper action buttons (server component: form actions) - using progressive enhancement pattern.
function ActionButtons({
	message,
	canHardDelete,
}: {
	message: { $id: string; removedAt?: string };
	canHardDelete: boolean;
}) {
	const removed = Boolean(message.removedAt);
	return (
		<div className="flex gap-2 text-xs">
			<form
				action={async () => {
					if (!removed) {
						await actionSoftDelete(message.$id);
					}
				}}
			>
				<button
					className="underline disabled:opacity-40"
					disabled={removed}
					type="submit"
				>
					Remove
				</button>
			</form>
			<form
				action={async () => {
					if (removed) {
						await actionRestore(message.$id);
					}
				}}
			>
				<button
					className="underline disabled:opacity-40"
					disabled={!removed}
					type="submit"
				>
					Restore
				</button>
			</form>
			{canHardDelete && (
				<form
					action={async () => {
						await actionHardDelete(message.$id);
					}}
				>
					<button className="text-destructive underline" type="submit">
						Hard
					</button>
				</form>
			)}
		</div>
	);
}

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
	content?: string;
	userId?: string;
};

function MessageRow({
	m,
	isAdmin,
	authorBadges,
	removerBadges,
}: {
	m: ModerationMessage;
	isAdmin: boolean;
	authorBadges: string[];
	removerBadges: string[];
}) {
	const removed = Boolean(m.removedAt);
	return (
		<div
			className={`flex flex-col gap-1 p-3 text-sm ${removed ? "opacity-60" : ""}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 break-words">
					<p className="font-medium text-muted-foreground text-xs">
						{m.serverId} / {m.channelId}
					</p>
					<p>{m.content}</p>
					{removed && m.removedAt && (
						<span className="mt-1 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
							Removed
						</span>
					)}
				</div>
				<ActionButtons canHardDelete={isAdmin} message={m} />
			</div>
			<div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
				<span>ID: {m.$id}</span>
				<span>User: {m.userId}</span>
				{authorBadges.map((b) => (
					<span className="rounded bg-secondary px-1 py-0.5" key={b}>
						{b}
					</span>
				))}
				{removed && m.removedAt && (
					<span>Removed: {new Date(m.removedAt).toLocaleString()}</span>
				)}
				{removed && m.removedBy && (
					<span>
						Removed by: {m.removedBy}{" "}
						{removerBadges.map((b) => (
							<span className="ml-1 rounded bg-primary/10 px-1 py-0.5" key={b}>
								{b}
							</span>
						))}
					</span>
				)}
				{isAdmin && (
					<span className="rounded bg-primary/10 px-1 py-0.5">admin view</span>
				)}
			</div>
		</div>
	);
}

export default async function ModerationPage({
	searchParams,
}: {
	searchParams?: Record<string, string | string[]>;
}) {
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
			<FilterForm params={params} serverChannels={data.channels} />
			<MessagesList
				badgeMap={badgeMap}
				documents={documents}
				isAdmin={isAdmin}
				nextCursor={nextCursor}
				params={params}
			/>
		</main>
	);
}

async function fetchModerationData(
	fetchMsgInput: ReturnType<typeof buildFetchInput>,
	serverFilter?: string,
) {
	const [messages, stats, channels] = await Promise.all([
		listGlobalMessages(fetchMsgInput),
		getBasicStats(),
		getServerChannels(serverFilter),
	]);
	return { messages, stats, channels };
}

function Header() {
	return (
		<header className="space-y-1">
			<h1 className="font-semibold text-2xl">Moderation Panel</h1>
			<p className="text-muted-foreground text-sm">
				Review and manage messages across servers & channels.
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
}: {
	params: ModerationSearchParams;
	serverChannels: { $id: string; name: string }[];
}) {
	const multiChannels = serverChannels.length > 0;
	return (
		<section>
			<form className="grid items-end gap-4 sm:grid-cols-12" method="get">
				<TextInput
					defaultValue={params.textFilter}
					id="q"
					label="Text"
					name="q"
					placeholder="search text"
				/>
				<TextInput
					defaultValue={params.userFilter}
					id="userId"
					label="User ID"
					name="userId"
					placeholder="user"
				/>
				<TextInput
					defaultValue={params.serverFilter}
					id="serverId"
					label="Server ID"
					name="serverId"
					placeholder="server"
				/>
				{multiChannels ? (
					<div className="flex flex-col">
						<label className="font-medium text-xs" htmlFor="channelIds">
							Channels (multi)
						</label>
						<select
							className="min-h-[2.5rem] rounded border px-2 py-1 text-xs"
							defaultValue={params.channelIdsFilter || []}
							id="channelIds"
							multiple
							name="channelIds"
						>
							{serverChannels.map((c) => (
								<option key={c.$id} value={c.$id}>
									{c.name} ({c.$id})
								</option>
							))}
						</select>
					</div>
				) : (
					<TextInput
						defaultValue={params.channelFilter}
						id="channelId"
						label="Channel ID"
						name="channelId"
						placeholder="channel"
					/>
				)}
				<CheckboxInput
					defaultChecked={params.includeRemoved}
					id="includeRemoved"
					label="Include Removed"
				/>
				<CheckboxInput
					defaultChecked={params.onlyRemoved}
					id="onlyRemoved"
					label="Only Removed"
				/>
				<CheckboxInput
					defaultChecked={params.onlyMissingServerId}
					id="onlyMissingServerId"
					label="Missing serverId"
				/>
				<NumberInput
					defaultValue={params.limit}
					id="limit"
					label="Limit"
					name="limit"
				/>
				<div>
					<button
						className="mt-4 rounded border px-3 py-1 text-sm"
						type="submit"
					>
						Apply
					</button>
				</div>
				<div>
					<a
						className="mt-4 inline-block rounded border px-3 py-1 text-sm"
						href="/moderation"
					>
						Clear
					</a>
				</div>
			</form>
		</section>
	);
}

function TextInput({
	id,
	label,
	name,
	defaultValue,
	placeholder,
}: {
	id: string;
	label: string;
	name: string;
	defaultValue?: string;
	placeholder?: string;
}) {
	return (
		<div className="flex flex-col">
			<label className="font-medium text-xs" htmlFor={id}>
				{label}
			</label>
			<input
				className="rounded border px-2 py-1 text-sm"
				defaultValue={defaultValue || ""}
				id={id}
				name={name}
				placeholder={placeholder}
			/>
		</div>
	);
}

function NumberInput({
	id,
	label,
	name,
	defaultValue,
}: {
	id: string;
	label: string;
	name: string;
	defaultValue: number;
}) {
	return (
		<div>
			<label className="font-medium text-xs" htmlFor={id}>
				{label}
			</label>
			<input
				className="w-20 rounded border px-2 py-1 text-sm"
				defaultValue={defaultValue}
				id={id}
				max={100}
				min={1}
				name={name}
				type="number"
			/>
		</div>
	);
}

function CheckboxInput({
	id,
	label,
	defaultChecked,
}: {
	id: string;
	label: string;
	defaultChecked?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<input
				className="h-4 w-4"
				defaultChecked={defaultChecked}
				id={id}
				name={id}
				type="checkbox"
			/>
			<label className="text-xs" htmlFor={id}>
				{label}
			</label>
		</div>
	);
}

function MessagesList({
	documents,
	badgeMap,
	isAdmin,
	params,
	nextCursor,
}: {
	documents: ModerationMessage[];
	badgeMap: Record<string, string[]>;
	isAdmin: boolean;
	params: ModerationSearchParams;
	nextCursor?: string;
}) {
	return (
		<section className="space-y-4">
			<div className="divide-y rounded border">
				{documents.map((m) => (
					<MessageRow
						authorBadges={badgeMap[m.userId || ""] || []}
						isAdmin={isAdmin}
						key={m.$id}
						m={m}
						removerBadges={badgeMap[m.removedBy || ""] || []}
					/>
				))}
				{documents.length === 0 && (
					<p className="p-4 text-muted-foreground text-sm">No messages.</p>
				)}
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
		<div className="flex items-center justify-between">
			<div />
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
				<button className="rounded border px-3 py-1 text-sm" type="submit">
					Next
				</button>
			</form>
		</div>
	);
}
