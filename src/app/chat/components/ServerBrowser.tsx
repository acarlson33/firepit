"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Server = {
	$id: string;
	name: string;
	ownerId: string;
	memberCount?: number;
};

type ServerBrowserProperties = {
	userId: string | null;
	membershipEnabled: boolean;
	onServerJoined?: () => void;
	joinedServerIds?: string[];
};

export function ServerBrowser({
	userId,
	membershipEnabled,
	onServerJoined,
	joinedServerIds = [],
}: ServerBrowserProperties) {
	const [servers, setServers] = useState<Server[]>([]);
	const [loading, setLoading] = useState(false);
	const [joining, setJoining] = useState<string | null>(null);

	const loadServers = async () => {
		setLoading(true);
		try {
			const response = await fetch("/api/servers/public");
			if (response.ok) {
				const data = await response.json();
				// Filter out servers the user has already joined
				const allServers = data.servers || [];
				const unjoinedServers = allServers.filter(
					(server: Server) => !joinedServerIds.includes(server.$id)
				);
				setServers(unjoinedServers);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load servers"
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		// Only load servers if we have a userId (auth is ready) and membership is enabled
		if (membershipEnabled && userId) {
			void loadServers();
		}
	}, [membershipEnabled, userId, joinedServerIds.join(",")]);

	const handleJoinServer = async (serverId: string) => {
		if (!userId) {
			toast.error("You must be logged in to join a server");
			return;
		}

		toast.info(`Attempting to join server ${serverId}...`);
		setJoining(serverId);
		try {
			const response = await fetch("/api/servers/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ serverId }), // Server gets userId from session
			});

			if (response.ok) {
				toast.success("Successfully joined server!");
				onServerJoined?.();
			} else {
				const data = await response.json();
				toast.error(data.error || "Failed to join server");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to join server"
			);
		} finally {
			setJoining(null);
		}
	};

	// Don't show anything if membership is disabled
	if (!membershipEnabled) {
		return null;
	}

	// Show loading state while waiting for userId
	if (!userId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Available Servers</CardTitle>
					<CardDescription>
						<span className="text-muted-foreground text-sm">
							Loading authentication...
						</span>
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// Hide the browser if there are no servers to join
	if (!loading && servers.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Available Servers</CardTitle>
				<CardDescription>
					Browse and join servers on this instance
				</CardDescription>
			</CardHeader>
			<CardContent>
				{loading ? (
					<div className="space-y-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								className="flex items-center justify-between rounded border p-3"
								key={i}
							>
								<div className="flex-1 space-y-2">
									<Skeleton className="h-5 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
								<Skeleton className="h-9 w-16" />
							</div>
						))}
					</div>
				) : (
					<div className="space-y-2">
						{servers.map((server) => (
							<div
								key={server.$id}
								className="flex items-center justify-between rounded border p-3 gap-3"
							>
								<div className="flex-1 min-w-0 overflow-hidden">
									<p className="font-medium truncate">{server.name}</p>
									<div className="mt-1 flex items-center gap-2">
										{server.memberCount !== undefined && (
											<span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
												<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
												</svg>
												{server.memberCount} {server.memberCount === 1 ? 'member' : 'members'}
											</span>
										)}
										<span className="text-xs text-muted-foreground">
											ID: {server.$id}
										</span>
									</div>
								</div>
								<Button
									type="button"
									disabled={joining === server.$id || !userId}
									size="sm"
									onClick={() => handleJoinServer(server.$id)}
								>
									{joining === server.$id ? "Joining..." : "Join"}
								</Button>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
