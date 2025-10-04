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

type Server = {
	$id: string;
	name: string;
	ownerId: string;
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
					<p className="text-muted-foreground text-sm">Loading servers...</p>
				) : (
					<div className="space-y-2">
						{servers.map((server) => (
							<div
								key={server.$id}
								className="flex items-center justify-between rounded border p-3"
							>
								<div>
									<p className="font-medium">{server.name}</p>
									<p className="text-muted-foreground text-xs">
										Server ID: {server.$id}
									</p>
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
