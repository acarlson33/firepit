import { redirect } from "next/navigation";
import {
    Filter,
    Hash,
    MessageSquare,
    SearchCheck,
    Server,
    ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FileAttachment } from "@/lib/types";
import {
    getBasicStats,
    listAllChannelsPage,
    listAllServersPage,
    listGlobalMessages,
} from "@/lib/appwrite-admin";
import { getProfilesByUserIds } from "@/lib/appwrite-profiles";
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
                    (v): v is string =>
                        typeof v === "string" && v.trim().length > 0,
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
            ...page.items.map((s) => ({
                $id: s.$id,
                name: s.name || "Unnamed Server",
            })),
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
    attachments?: FileAttachment[];
    imageUrl?: string;
    removedAt?: string;
    removedBy?: string;
    serverId?: string;
    channelId?: string;
    text?: string;
    userId?: string;
    userName?: string;
    mentions?: string[];
};

type ModerationDisplayMessage = ModerationMessage & {
    senderDisplay: string;
    serverDisplay: string;
    channelDisplay: string;
    removedByDisplay?: string;
};

function shortId(value?: string) {
    if (!value) {
        return "";
    }
    return value.slice(0, 8);
}

async function buildChannelNameMap(serverIds: string[]) {
    const channelNameMap = new Map<string, string>();
    for (const serverId of serverIds) {
        let cursor: string | undefined;
        for (let i = 0; i < CHANNEL_PAGE_SCAN_LIMIT; i += 1) {
            const page = await listAllChannelsPage(serverId, 100, cursor);
            for (const channel of page.items) {
                channelNameMap.set(channel.$id, channel.name || "");
            }
            if (!page.nextCursor) {
                break;
            }
            cursor = page.nextCursor;
        }
    }
    return channelNameMap;
}

async function enrichModerationMessages(
    documents: ModerationMessage[],
    servers: { $id: string; name: string }[],
) {
    const serverNameMap = new Map(servers.map((s) => [s.$id, s.name]));
    const serverIds = new Set<string>();
    const userIds = new Set<string>();

    for (const message of documents) {
        if (message.serverId) {
            serverIds.add(message.serverId);
        }
        if (message.userId) {
            userIds.add(message.userId);
        }
        if (message.removedBy) {
            userIds.add(message.removedBy);
        }
    }

    const [channelNameMap, profilesByUserId] = await Promise.all([
        buildChannelNameMap([...serverIds]),
        getProfilesByUserIds([...userIds]),
    ]);

    return documents.map((message) => {
        const senderProfile = message.userId
            ? profilesByUserId.get(message.userId)
            : null;
        const removedByProfile = message.removedBy
            ? profilesByUserId.get(message.removedBy)
            : null;

        const senderDisplay =
            message.userName?.trim() ||
            senderProfile?.displayName ||
            shortId(message.userId);

        const serverDisplay = message.serverId
            ? (serverNameMap.get(message.serverId) ?? shortId(message.serverId))
            : "No Server";

        const channelDisplay = message.channelId
            ? (channelNameMap.get(message.channelId) ??
              shortId(message.channelId))
            : "No Channel";

        const removedByDisplay = message.removedBy
            ? (removedByProfile?.displayName ?? shortId(message.removedBy))
            : undefined;

        return {
            ...message,
            senderDisplay,
            serverDisplay,
            channelDisplay,
            removedByDisplay,
        };
    });
}

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
    const enrichedDocuments = await enrichModerationMessages(
        documents,
        data.servers,
    );
    const nextCursor = data.messages.nextCursor || undefined;
    const badgeMap = await buildBadgeMapSimple(documents);
    return (
        <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
            <Header />
            <StatsGrid stats={data.stats} />
            <FilterForm
                params={params}
                serverChannels={data.channels}
                servers={data.servers}
            />
            <MessagesList
                badgeMap={badgeMap}
                documents={enrichedDocuments}
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
        <header className="grid gap-6 overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
            <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    Live moderation tools
                </div>
                <div className="space-y-4">
                    <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                        Moderation panel built for fast triage.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                        Sweep messages across every server in seconds. Apply
                        filters, jump into context, and take action without
                        leaving this workspace.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Search
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                            Find the message that matters.
                        </p>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Scope
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                            Narrow by server, channel, or sender.
                        </p>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Action
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                            Remove or review without changing context.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <SearchCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    Triage hints
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                    Select a server to unlock channel filtering, or combine text
                    and user filters to surface a focused review queue.
                </p>
                <div className="grid gap-3 text-sm text-muted-foreground">
                    <div className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                        Use removed-only when reviewing completed actions.
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                        Use channel IDs when narrowing a large server.
                    </div>
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
                <StatBox
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    value={item.value}
                />
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
        <div className="rounded-4xl border border-border/60 bg-background/70 p-5 shadow-lg">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{label}</span>
                <span className="rounded-full border border-border/50 bg-card/70 p-2 text-foreground">
                    {icon}
                </span>
            </div>
            <p className="mt-4 text-3xl font-semibold text-foreground">
                {value}
            </p>
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
        <section className="rounded-4xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
                <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>Refine results</span>
            </div>
            <form className="mt-6 space-y-6" method="get">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label
                            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            htmlFor="q"
                        >
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
                        <label
                            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            htmlFor="userId"
                        >
                            User ID{" "}
                            <span className="text-muted-foreground">
                                (optional)
                            </span>
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
                            <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor="serverId"
                            >
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
                            <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor="serverId"
                            >
                                Server ID{" "}
                                <span className="text-muted-foreground">
                                    (optional)
                                </span>
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
                            <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor="channelIds"
                            >
                                Channels{" "}
                                <span className="text-muted-foreground text-[11px]">
                                    (Ctrl/Cmd+Click for multiple)
                                </span>
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
                            <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor="channelId"
                            >
                                Channel ID{" "}
                                <span className="text-muted-foreground">
                                    (optional)
                                </span>
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
                    <label
                        className="inline-flex items-center gap-2 text-sm"
                        htmlFor="includeRemoved"
                    >
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
                    <label
                        className="inline-flex items-center gap-2 text-sm"
                        htmlFor="onlyRemoved"
                    >
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
                        <label
                            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            htmlFor="limit"
                        >
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
                        className="rounded-full border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                        type="submit"
                    >
                        Apply filters
                    </button>
                    <a
                        className="rounded-full border border-border/60 bg-muted/50 px-5 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
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
    documents: ModerationDisplayMessage[];
    badgeMap: Record<string, string[]>;
    params: ModerationSearchParams;
    nextCursor?: string;
    isAdmin: boolean;
}) {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Messages</h2>
                <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {documents.length} result{documents.length === 1 ? "" : "s"}
                </span>
            </div>
            <div className="rounded-4xl border border-border/60 bg-card/80 p-4 shadow-2xl backdrop-blur-sm">
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
            <form
                className="inline-flex flex-wrap items-center justify-center gap-3 rounded-4xl border border-border/60 bg-card/75 px-6 py-4 shadow-xl backdrop-blur-sm"
                method="get"
            >
                <input name="cursor" type="hidden" value={nextCursor} />
                <input name="limit" type="hidden" value={params.limit} />
                {params.includeRemoved && (
                    <input name="includeRemoved" type="hidden" value="true" />
                )}
                {params.onlyRemoved && (
                    <input name="onlyRemoved" type="hidden" value="true" />
                )}
                {params.userFilter && (
                    <input
                        name="userId"
                        type="hidden"
                        value={params.userFilter}
                    />
                )}
                {params.channelFilter && !params.channelIdsFilter?.length && (
                    <input
                        name="channelId"
                        type="hidden"
                        value={params.channelFilter}
                    />
                )}
                {params.channelIdsFilter?.map((cid) => (
                    <input
                        key={cid}
                        name="channelIds"
                        type="hidden"
                        value={cid}
                    />
                ))}
                {params.serverFilter && (
                    <input
                        name="serverId"
                        type="hidden"
                        value={params.serverFilter}
                    />
                )}
                {params.onlyMissingServerId && (
                    <input
                        name="onlyMissingServerId"
                        type="hidden"
                        value="true"
                    />
                )}
                {params.textFilter && (
                    <input name="q" type="hidden" value={params.textFilter} />
                )}
                <button
                    className="rounded-full border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                    type="submit"
                >
                    Load more messages
                </button>
            </form>
        </div>
    );
}
