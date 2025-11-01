"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
	listDirectMessages,
	sendDirectMessage,
	editDirectMessage,
	deleteDirectMessage,
} from "@/lib/appwrite-dms-client";
import type { DirectMessage } from "@/lib/types";
import { parseReactions } from "@/lib/reactions-utils";

const env = getEnvConfig();
const DIRECT_MESSAGES_COLLECTION = env.collections.directMessages;
const TYPING_COLLECTION_ID = env.collections.typing || undefined;

type UseDirectMessagesProps = {
	conversationId: string | null;
	userId: string | null;
	receiverId?: string;
	userName?: string | null;
};

export function useDirectMessages({
	conversationId,
	userId,
	receiverId,
	userName,
}: UseDirectMessagesProps) {
	const [messages, setMessages] = useState<DirectMessage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [typingUsers, setTypingUsers] = useState<
		Record<string, { userId: string; userName?: string; updatedAt: string }>
	>({});
	const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
	const lastTypingSentState = useRef<boolean>(false);
	const lastTypingSentAt = useRef<number>(0);

	const typingIdleMs = 2500;
	const typingStartDebounceMs = 400;

	const loadMessages = useCallback(async () => {
		if (!conversationId || !DIRECT_MESSAGES_COLLECTION) {
			setMessages([]);
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			
			// Optimized: Batch query all messages at once
			// User profiles are fetched in batches (5 at a time) to reduce API calls
			// Images are already included in the response with URLs
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
						const messageData = {
							...(payload as unknown as DirectMessage),
							reactions: parseReactions((payload as Record<string, unknown>).reactions as string | undefined),
						};
						
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
		async (text: string, imageFileId?: string, imageUrl?: string, replyToId?: string, attachments?: unknown[]) => {
			if (!conversationId || !userId || !receiverId) {
				return;
			}

			// Require either text, image, or attachments
			if (!text.trim() && !imageFileId && (!attachments || attachments.length === 0)) {
				return;
			}

			setSending(true);
			try {
				await sendDirectMessage(
					conversationId,
					userId,
					receiverId,
					text.trim() || "",
					imageFileId,
					imageUrl,
					replyToId,
					attachments
				);
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

	// Typing indicator management
	const sendTypingState = useCallback((state: boolean) => {
		if (!userId || !conversationId) {
			return;
		}
		const now = Date.now();
		if (
			state === lastTypingSentState.current &&
			now - lastTypingSentAt.current < typingStartDebounceMs
		) {
			return;
		}
		lastTypingSentState.current = state;
		lastTypingSentAt.current = now;
		
		// Use conversationId for DM typing status
		if (state) {
			fetch("/api/typing", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId,
					userName: userName || undefined,
				}),
			}).then((response) => {
				if (!response.ok) {
					console.warn('[typing] Failed to set typing status:', response.status);
				}
			}).catch((error) => {
				console.warn('[typing] Error updating typing status:', error);
			});
		} else {
			fetch(`/api/typing?conversationId=${encodeURIComponent(conversationId)}`, {
				method: "DELETE",
			}).then((response) => {
				if (!response.ok) {
					console.warn('[typing] Failed to clear typing status:', response.status);
				}
			}).catch((error) => {
				console.warn('[typing] Error updating typing status:', error);
			});
		}
	}, [userId, conversationId, userName, typingStartDebounceMs]);

	const scheduleTypingStop = useCallback(() => {
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}
		typingTimeoutRef.current = setTimeout(() => {
			sendTypingState(false);
		}, typingIdleMs);
	}, [sendTypingState, typingIdleMs]);

	const scheduleTypingStart = useCallback(() => {
		if (typingDebounceRef.current) {
			clearTimeout(typingDebounceRef.current);
		}
		typingDebounceRef.current = setTimeout(() => {
			sendTypingState(true);
		}, typingStartDebounceMs);
	}, [sendTypingState, typingStartDebounceMs]);

	const handleTypingChange = useCallback((text: string) => {
		if (!userId || !conversationId) {
			return;
		}
		const isTyping = text.trim().length > 0;
		if (isTyping) {
			scheduleTypingStart();
			scheduleTypingStop();
		} else {
			if (typingDebounceRef.current) {
				clearTimeout(typingDebounceRef.current);
			}
			sendTypingState(false);
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
		}
	}, [userId, conversationId, scheduleTypingStart, scheduleTypingStop, sendTypingState]);

	// Realtime subscription for typing indicators
	useEffect(() => {
		if (!conversationId || !TYPING_COLLECTION_ID) {
			setTypingUsers({});
			return;
		}

		const databaseId = env.databaseId;
		
		import("appwrite").then(({ Client }) => {
			const client = new Client()
				.setEndpoint(env.endpoint)
				.setProject(env.project);

			const typingChannel = `databases.${databaseId}.collections.${TYPING_COLLECTION_ID}.documents`;

			const unsubscribe = client.subscribe(typingChannel, (response) => {
				const payload = response.payload as Record<string, unknown>;
				const events = response.events as string[];
				
				const typing = {
					$id: String(payload.$id),
					userId: String(payload.userId),
					userName: payload.userName as string | undefined,
					channelId: String(payload.channelId),
					updatedAt: String(payload.$updatedAt || payload.updatedAt),
				};

				// Only process typing events for current conversation
				if (typing.channelId !== conversationId) {
					return;
				}

				// Ignore typing events from current user
				if (typing.userId === userId) {
					return;
				}

				console.log('[typing] Received event:', events, typing);

				if (events.some((e) => e.endsWith(".delete"))) {
					setTypingUsers((prev) => {
						const updated = { ...prev };
						delete updated[typing.userId];
						return updated;
					});
				} else if (
					events.some((e) => e.endsWith(".create") || e.endsWith(".update"))
				) {
					setTypingUsers((prev) => ({
						...prev,
						[typing.userId]: {
							userId: typing.userId,
							userName: typing.userName,
							updatedAt: typing.updatedAt,
						},
					}));
				}
			});

			return () => {
				unsubscribe();
			};
		}).catch(() => {
			// Ignore subscription errors
		});
	}, [conversationId, userId]);

	// Cleanup stale typing indicators
	useEffect(() => {
		const interval = setInterval(() => {
			const now = Date.now();
			const staleThreshold = 5000;
			
			setTypingUsers((prev) => {
				const updated = { ...prev };
				let hasChanges = false;
				
				for (const [uid, typing] of Object.entries(updated)) {
					const updatedTime = new Date(typing.updatedAt).getTime();
					if (now - updatedTime > staleThreshold) {
						delete updated[uid];
						hasChanges = true;
					}
				}
				
				return hasChanges ? updated : prev;
			});
		}, 1000);
		
		return () => clearInterval(interval);
	}, []);

	// Cleanup typing status on unmount
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
			if (typingDebounceRef.current) {
				clearTimeout(typingDebounceRef.current);
			}
			sendTypingState(false);
		};
	}, [sendTypingState]);

	return {
		messages,
		loading,
		error,
		sending,
		send,
		edit,
		deleteMsg,
		refresh: loadMessages,
		typingUsers,
		handleTypingChange,
	};
}
