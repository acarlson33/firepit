"use client";

import { useEffect, useState, useCallback } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { UserStatus } from "@/lib/types";

const env = getEnvConfig();
const STATUSES_COLLECTION = env.collections.statuses;

type StatusMap = Map<string, UserStatus>;

/**
 * Hook to subscribe to real-time status updates for multiple users
 */
export function useStatusSubscription(userIds: string[]) {
	const [statuses, setStatuses] = useState<StatusMap>(new Map());
	const [loading, setLoading] = useState(true);

	// Fetch initial statuses
	const fetchStatuses = useCallback(async () => {
		if (!STATUSES_COLLECTION || userIds.length === 0) {
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			const response = await fetch("/api/status/batch", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userIds }),
			});

			if (response.ok) {
				const data = await response.json();
				const statusMap = new Map<string, UserStatus>();
				
				// data.statuses is a Record<userId, UserStatus>
				if (data.statuses) {
					Object.entries(data.statuses).forEach(([userId, status]) => {
						statusMap.set(userId, status as UserStatus);
					});
				}
				
				setStatuses(statusMap);
			}
		} catch (error) {
			console.error("Failed to fetch statuses:", error);
		} finally {
			setLoading(false);
		}
	}, [userIds.join(",")]); // Only re-fetch when user IDs change

	useEffect(() => {
		void fetchStatuses();
	}, [fetchStatuses]);

	// Real-time subscription to status updates
	useEffect(() => {
		if (!STATUSES_COLLECTION || userIds.length === 0) {
			return;
		}

		// Import dynamically to avoid SSR issues
		import("appwrite").then(({ Client }) => {
			const client = new Client()
				.setEndpoint(env.endpoint)
				.setProject(env.project);

			const unsubscribe = client.subscribe(
				`databases.${env.databaseId}.collections.${STATUSES_COLLECTION}.documents`,
				(response) => {
					const payload = response.payload as Record<string, unknown>;
					const userId = payload.userId as string | undefined;

					// Only update if this status is for one of our tracked users
					if (userId && userIds.includes(userId)) {
						const status: UserStatus = {
							$id: String(payload.$id),
							userId: String(payload.userId),
							status: String(payload.status) as "online" | "away" | "busy" | "offline",
							customMessage: payload.customMessage ? String(payload.customMessage) : undefined,
							lastSeenAt: String(payload.lastSeenAt),
							expiresAt: payload.expiresAt ? String(payload.expiresAt) : undefined,
							isManuallySet: payload.isManuallySet ? Boolean(payload.isManuallySet) : undefined,
							$updatedAt: payload.$updatedAt ? String(payload.$updatedAt) : undefined,
						};

						setStatuses((prev) => {
							const next = new Map(prev);
							next.set(userId, status);
							return next;
						});
					}
				},
			);

			return () => {
				unsubscribe();
			};
		}).catch(() => {
			// Ignore subscription errors
		});
	}, [userIds.join(",")]); // Re-subscribe when user IDs change

	return {
		statuses,
		loading,
		refresh: fetchStatuses,
	};
}
