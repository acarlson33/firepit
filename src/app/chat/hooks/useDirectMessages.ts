"use client";

import { useEffect, useState, useCallback } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
	listDirectMessages,
	sendDirectMessage,
	editDirectMessage,
	deleteDirectMessage,
} from "@/lib/appwrite-dms-client";
import type { DirectMessage } from "@/lib/types";

const env = getEnvConfig();
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;

type UseDirectMessagesProps = {
	conversationId: string | null;
	userId: string | null;
	receiverId?: string;
};

export function useDirectMessages({
	conversationId,
	userId,
	receiverId,
}: UseDirectMessagesProps) {
	const [messages, setMessages] = useState<DirectMessage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);

	const loadMessages = useCallback(async () => {
		if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
			setMessages([]);
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const result = await listDirectMessages(conversationId);
			// Reverse to show oldest first
			setMessages(result.items.reverse());
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load messages",
			);
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		void loadMessages();
	}, [loadMessages]);

	// Real-time subscription
	useEffect(() => {
		if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
			return;
		}

		// Import dynamically to avoid SSR issues
		import("appwrite").then(({ Client }) => {
			const client = new Client()
				.setEndpoint(env.endpoint)
				.setProject(env.project);

			const unsubscribe = client.subscribe(
				`databases.${env.databaseId}.collections.${DIRECT_MESSAGES_COLLECTION}.documents`,
				(response) => {
					const payload = response.payload as Record<string, unknown>;
					const msgConversationId = payload.conversationId;
					const events = response.events as string[];

					// Only update if message belongs to this conversation
					if (msgConversationId === conversationId) {
						const messageData = payload as unknown as DirectMessage;
						
						// Handle different event types to avoid full reload
						if (events.some((e) => e.endsWith(".create"))) {
							setMessages((prev) => {
								// Check if message already exists to prevent duplicates
								if (prev.some((m) => m.$id === messageData.$id)) {
									return prev;
								}
								return [...prev, messageData];
							});
						} else if (events.some((e) => e.endsWith(".update"))) {
							setMessages((prev) =>
								prev.map((m) => (m.$id === messageData.$id ? messageData : m))
							);
						} else if (events.some((e) => e.endsWith(".delete"))) {
							setMessages((prev) => prev.filter((m) => m.$id !== messageData.$id));
						}
					}
				},
			);

			return () => {
				unsubscribe();
			};
		}).catch(() => {
			// Ignore subscription errors
		});
	}, [conversationId]);

	const send = useCallback(
		async (text: string) => {
			if (!conversationId || !userId || !receiverId || !text.trim()) {
				return;
			}

			setSending(true);
			try {
				await sendDirectMessage(conversationId, userId, receiverId, text.trim());
				await loadMessages();
			} catch (err) {
				throw new Error(
					err instanceof Error ? err.message : "Failed to send message",
				);
			} finally {
				setSending(false);
			}
		},
		[conversationId, userId, receiverId, loadMessages],
	);

	const edit = useCallback(
		async (messageId: string, newText: string) => {
			if (!newText.trim()) {
				return;
			}

			try {
				await editDirectMessage(messageId, newText.trim());
				await loadMessages();
			} catch (err) {
				throw new Error(
					err instanceof Error ? err.message : "Failed to edit message",
				);
			}
		},
		[loadMessages],
	);

	const deleteMsg = useCallback(
		async (messageId: string) => {
			if (!userId) {
				return;
			}

			try {
				await deleteDirectMessage(messageId, userId);
				await loadMessages();
			} catch (err) {
				throw new Error(
					err instanceof Error ? err.message : "Failed to delete message",
				);
			}
		},
		[userId, loadMessages],
	);

	return {
		messages,
		loading,
		error,
		sending,
		send,
		edit,
		deleteMsg,
		refresh: loadMessages,
	};
}
