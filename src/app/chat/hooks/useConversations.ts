"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { listConversations } from "@/lib/appwrite-dms-client";
import type { Conversation } from "@/lib/types";
import { useStatusSubscription } from "./useStatusSubscription";

const env = getEnvConfig();
const CONVERSATIONS_COLLECTION = env.collections.conversations;

export function useConversations(userId: string | null) {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadConversations = useCallback(async () => {
		if (!userId || !CONVERSATIONS_COLLECTION) {
			setConversations([]);
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const convs = await listConversations(userId);
			setConversations(convs);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load conversations");
		} finally {
			setLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		void loadConversations();
	}, [loadConversations]);

	// Get all other user IDs from conversations
	const otherUserIds = useMemo(() => {
		return conversations
			.map((conv) => conv.participants.find((id) => id !== userId))
			.filter((id): id is string => id !== undefined);
	}, [conversations, userId]);

	// Subscribe to status updates for all other users
	const { statuses } = useStatusSubscription(otherUserIds);

	// Merge real-time status updates into conversations
	const conversationsWithStatus = useMemo(() => {
		return conversations.map((conv) => {
			const otherUserId = conv.participants.find((id) => id !== userId);
			if (!otherUserId) {
				return conv;
			}

			const liveStatus = statuses.get(otherUserId);
			
			// If we have a live status update, use it
			if (liveStatus) {
				return {
					...conv,
					otherUser: {
						...conv.otherUser,
						userId: otherUserId,
						status: liveStatus.status,
					},
				};
			}

			return conv;
		});
	}, [conversations, statuses, userId]);

	// Real-time subscription to conversation changes
	useEffect(() => {
		if (!userId || !CONVERSATIONS_COLLECTION) {
			return;
		}

		// Import dynamically to avoid SSR issues
		import("appwrite").then(({ Client }) => {
			const client = new Client()
				.setEndpoint(env.endpoint)
				.setProject(env.project);

			const unsubscribe = client.subscribe(
				`databases.${env.databaseId}.collections.${CONVERSATIONS_COLLECTION}.documents`,
				(response) => {
					const payload = response.payload as Record<string, unknown>;
					const participants = payload.participants as string[] | undefined;

					// Only update if this user is a participant
					if (participants?.includes(userId)) {
						void loadConversations();
					}
				},
			);

			return () => {
				unsubscribe();
			};
		}).catch(() => {
			// Ignore subscription errors
		});
	}, [userId, loadConversations]);

	return {
		conversations: conversationsWithStatus,
		loading,
		error,
		refresh: loadConversations,
	};
}
