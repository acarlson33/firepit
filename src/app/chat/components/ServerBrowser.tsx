"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ArrowUpDown,
	RefreshCcw,
	Search,
	Sparkles,
	Users,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Server = {
	$id: string;
	$createdAt?: string;
	name: string;
	ownerId: string;
	memberCount?: number;
	description?: string;
	iconUrl?: string;
	bannerUrl?: string;
	defaultOnSignup?: boolean;
};

type SortMode = "featured" | "members" | "newest" | "name";

type ServerBrowserProperties = {
	userId: string | null;
	onServerJoined?: () => void;
	joinedServerIds?: string[];
};

function compareByNewest(left: Server, right: Server) {
	const leftTimestamp = Date.parse(left.$createdAt ?? "");
	const rightTimestamp = Date.parse(right.$createdAt ?? "");
	const leftValue = Number.isNaN(leftTimestamp) ? 0 : leftTimestamp;
	const rightValue = Number.isNaN(rightTimestamp) ? 0 : rightTimestamp;
	return rightValue - leftValue;
}

function compareByMembers(left: Server, right: Server) {
	const leftMembers = left.memberCount ?? 0;
	const rightMembers = right.memberCount ?? 0;
	if (leftMembers !== rightMembers) {
		return rightMembers - leftMembers;
	}

	return left.name.localeCompare(right.name);
}

function compareByFeatured(left: Server, right: Server) {
	const leftScore = left.defaultOnSignup ? 1 : 0;
	const rightScore = right.defaultOnSignup ? 1 : 0;

	if (leftScore !== rightScore) {
		return rightScore - leftScore;
	}

	return compareByMembers(left, right);
}

function formatMemberCount(memberCount: number | undefined) {
	const value = memberCount ?? 0;
	return `${value.toLocaleString()} ${value === 1 ? "member" : "members"}`;
}

function sanitizeBannerUrl(bannerUrl: string | undefined) {
	if (!bannerUrl) {
		return null;
	}

	try {
		const parsedUrl = new URL(bannerUrl);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return null;
		}

		return parsedUrl.toString()
			.replaceAll("\\", "\\\\")
			.replaceAll('"', '\\"');
	} catch {
		return null;
	}
}

export function ServerBrowser({
	userId,
	onServerJoined,
	joinedServerIds = [],
}: ServerBrowserProperties) {
	const [servers, setServers] = useState<Server[]>([]);
	const [loading, setLoading] = useState(false);
	const [joining, setJoining] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [sortMode, setSortMode] = useState<SortMode>("featured");
	const joinedServerIdsKey = joinedServerIds.join(",");
	const joinedServerIdSet = useMemo(
		() => new Set(joinedServerIds),
		[joinedServerIdsKey],
	);
	const canLoadServers = Boolean(userId);

	const loadServers = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetch("/api/servers/public", {
				cache: "no-store",
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to load servers");
			}

			const data = (await response.json()) as {
				servers?: Server[];
			};

			const allServers = data.servers || [];
			const unjoinedServers = allServers.filter(
				(server) => !joinedServerIdSet.has(server.$id),
			);
			setServers(unjoinedServers);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load servers",
			);
		} finally {
			setLoading(false);
		}
	}, [joinedServerIdSet]);

	useEffect(() => {
		if (canLoadServers) {
			void loadServers();
		}
	}, [canLoadServers, loadServers]);

	const visibleServers = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();

		const filtered = normalizedQuery
			? servers.filter((server) => {
				  const haystack = `${server.name} ${server.description ?? ""}`
					  .toLowerCase()
					  .trim();
				  return haystack.includes(normalizedQuery);
			  })
			: servers;

		const sorted = [...filtered];
		switch (sortMode) {
			case "members": {
				sorted.sort(compareByMembers);
				break;
			}
			case "newest": {
				sorted.sort(compareByNewest);
				break;
			}
			case "name": {
				sorted.sort((left, right) => left.name.localeCompare(right.name));
				break;
			}
			default: {
				sorted.sort(compareByFeatured);
				break;
			}
		}

		return sorted;
	}, [query, servers, sortMode]);

	const handleJoinServer = async (serverId: string) => {
		if (!userId) {
			toast.error("You must be logged in to join a server");
			return;
		}

		setJoining(serverId);
		try {
			const response = await fetch("/api/servers/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ serverId }),
			});

			if (response.ok) {
				setServers((prev) => prev.filter((server) => server.$id !== serverId));
				toast.success("Successfully joined server");
				onServerJoined?.();
				return;
			}

			const data = (await response.json()) as { error?: string };
			toast.error(data.error || "Failed to join server");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to join server",
			);
		} finally {
			setJoining(null);
		}
	};

	if (!userId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Discover Servers</CardTitle>
					<CardDescription>Loading authentication...</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="space-y-3">
				<div>
					<CardTitle>Discover Servers</CardTitle>
					<CardDescription>
						Explore public communities with rich previews and join in
						one click.
					</CardDescription>
				</div>

				<div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							aria-label="Search servers"
							className="pl-8"
							id="server-browser-search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search by name or description"
						/>
					</div>

					<Select
						value={sortMode}
						onValueChange={(value) => setSortMode(value as SortMode)}
					>
						<SelectTrigger aria-label="Sort servers" id="server-browser-sort">
							<div className="flex items-center gap-2">
								<ArrowUpDown className="h-4 w-4 text-muted-foreground" />
								<SelectValue />
							</div>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="featured">Featured</SelectItem>
							<SelectItem value="members">Most members</SelectItem>
							<SelectItem value="newest">Newest</SelectItem>
							<SelectItem value="name">Name</SelectItem>
						</SelectContent>
					</Select>

					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void loadServers();
						}}
						disabled={loading}
					>
						<RefreshCcw
							className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>

				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{loading
							? "Loading public servers..."
							: `${visibleServers.length} server${visibleServers.length === 1 ? "" : "s"} available`}
					</span>
					<span>Hidden: already joined servers</span>
				</div>
			</CardHeader>

			<CardContent>
				{loading ? (
					<div className="grid gap-3 sm:grid-cols-2">
						{Array.from({ length: 4 }).map((_, index) => (
							<div
								className="overflow-hidden rounded-xl border border-border/60"
								key={`server-browser-skeleton-${index}`}
							>
								<Skeleton className="h-20 w-full" />
								<div className="space-y-3 p-3">
									<div className="flex items-center gap-3">
										<Skeleton className="h-10 w-10 rounded-full" />
										<div className="space-y-2">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-3 w-24" />
										</div>
									</div>
									<Skeleton className="h-3 w-full" />
									<Skeleton className="h-3 w-3/4" />
									<Skeleton className="h-8 w-20" />
								</div>
							</div>
						))}
					</div>
				) : visibleServers.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border p-6 text-center">
						<p className="text-sm font-medium">
							{servers.length === 0
								? "No additional public servers are available right now."
								: "No servers match your current search."}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{servers.length === 0
								? "Try refreshing later or ask an admin to mark more servers as public."
								: "Adjust your query or switch sorting to discover more options."}
						</p>
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						{visibleServers.map((server) => {
							const sanitizedBannerUrl = sanitizeBannerUrl(server.bannerUrl);

							return (
							<article
								key={server.$id}
								className="overflow-hidden rounded-xl border border-border/60 bg-background"
							>
								<div
									className="h-20 w-full bg-linear-to-r from-sky-500/20 via-cyan-500/15 to-emerald-500/20"
									style={
										sanitizedBannerUrl
											? {
												  backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.55), rgba(2,6,23,0.1)), url("${sanitizedBannerUrl}")`,
												  backgroundSize: "cover",
												  backgroundPosition: "center",
											  }
											: undefined
									}
								/>

								<div className="space-y-3 p-3">
									<div className="flex items-start gap-3">
										<Avatar
											src={server.iconUrl ?? null}
											alt={server.name}
											fallback={server.name}
											size="lg"
										/>

										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold">
												{server.name}
											</p>
											<div className="mt-1 flex flex-wrap items-center gap-1.5">
												<Badge
													variant="secondary"
													className="inline-flex items-center gap-1"
												>
													<Users className="h-3 w-3" />
													{formatMemberCount(server.memberCount)}
												</Badge>
												{server.defaultOnSignup ? (
													<Badge
														variant="outline"
														className="inline-flex items-center gap-1"
													>
														<Sparkles className="h-3 w-3" />
														Recommended
													</Badge>
												) : null}
											</div>
										</div>
									</div>

									<p className="min-h-10 text-xs text-muted-foreground">
										{server.description || "No server description yet."}
									</p>

									<div className="flex items-center justify-between gap-2">
										<span className="text-[11px] text-muted-foreground">
											{server.$createdAt
												? `Created ${new Date(server.$createdAt).toLocaleDateString()}`
												: "Public server"}
										</span>

										<Button
											type="button"
											size="sm"
											disabled={joining === server.$id}
											onClick={() => {
												void handleJoinServer(server.$id);
											}}
										>
											{joining === server.$id
												? "Joining..."
												: "Join Server"}
										</Button>
									</div>
								</div>
							</article>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
