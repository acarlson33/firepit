"use client";

import { useEffect, useState, useCallback } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import { listConversations } from "@/lib/appwrite-dms-client";
import type { Conversation } from "@/lib/types";

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

	// Real-time subscription
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
		conversations,
		loading,
		error,
		refresh: loadConversations,
	};
}
