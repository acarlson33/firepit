"use client";
import type { RealtimeResponseEvent } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  canSend,
  setTyping,
} from "@/lib/appwrite-messages";
import { getEnrichedMessages } from "@/lib/appwrite-messages-enriched";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { Message } from "@/lib/types";

const env = getEnvConfig();

type UseMessagesOptions = {
  channelId: string | null;
  serverId?: string | null;
  userId: string | null;
  userName: string | null;
};

export function useMessages({
  channelId,
  serverId,
  userId,
  userName,
}: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [text, setText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { userId: string; userName?: string; updatedAt: string }>
  >({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentState = useRef<boolean>(false);
  const lastTypingSentAt = useRef<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  const pageSize = 30;
  const typingIdleMs = 2500; // how long until we send a "stopped" event
  const typingStartDebounceMs = 400; // debounce for consecutive "started" events
  const userIdSlice = 6;
  const maxTypingDisplay = 3;

  // load messages when channel changes
  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      setOldestCursor(null);
      setHasMore(false);
      return;
    }
    (async () => {
      try {
        const initial = await getEnrichedMessages(
          pageSize,
          undefined,
          channelId
        );
        setMessages(initial);
        if (initial.length) {
          setOldestCursor(initial[0].$id);
          // If we got a full page, there might be more
          setHasMore(initial.length === pageSize);
        } else {
          setHasMore(false);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load messages"
        );
      }
    })().catch(() => {
      /* error already surfaced via toast */
    });
  }, [channelId, pageSize]);

  // realtime subscription for messages
  useEffect(() => {
    if (!channelId) {
      return;
    }
    const databaseId = env.databaseId;
    const collectionId = env.collections.messages;
    const missing = [databaseId, collectionId].some((v) => !v);
    if (missing) {
      return;
    }

    import("@/lib/realtime-pool")
      .then(({ getSharedClient, trackSubscription }) => {
        const c = getSharedClient();
        const messageChannel = `databases.${databaseId}.collections.${collectionId}.documents`;

        function parseBase(
          event: RealtimeResponseEvent<Record<string, unknown>>
        ) {
          const p = event.payload;
          return {
            $id: String(p.$id),
            userId: String(p.userId),
            userName: p.userName as string | undefined,
            text: String(p.text),
            $createdAt: String(p.$createdAt),
            editedAt: p.editedAt as string | undefined,
            channelId: p.channelId as string | undefined,
            removedAt: p.removedAt as string | undefined,
            removedBy: p.removedBy as string | undefined,
            imageFileId: p.imageFileId as string | undefined,
            imageUrl: p.imageUrl as string | undefined,
          } as Message;
        }
        function includeMessage(base: { channelId?: string }) {
          if (channelId && base.channelId !== channelId) {
            return false;
          }
          if (!channelId && base.channelId) {
            return false;
          }
          return true;
        }
        async function applyCreate(base: Message) {
          // Enrich message with profile data before adding to state
          const { enrichMessageWithProfile } = await import("@/lib/enrich-messages");
          const enriched = await enrichMessageWithProfile(base);
          setMessages((prev) => {
            // Check if message already exists to prevent duplicates
            if (prev.some((m) => m.$id === enriched.$id)) {
              return prev;
            }
            return [...prev, enriched].sort((a, b) =>
              a.$createdAt.localeCompare(b.$createdAt)
            );
          });
        }
        async function applyUpdate(base: Message) {
          // Enrich message with profile data before updating state
          const { enrichMessageWithProfile } = await import("@/lib/enrich-messages");
          const enriched = await enrichMessageWithProfile(base);
          setMessages((prev) =>
            prev.map((m) => (m.$id === enriched.$id ? { ...m, ...enriched } : m))
          );
        }
        function applyDelete(base: Message) {
          setMessages((prev) => prev.filter((m) => m.$id !== base.$id));
        }
        function dispatchByEvents(evs: string[], base: Message) {
          if (evs.some((e) => e.endsWith(".create"))) {
            void applyCreate(base);
            return;
          }
          if (evs.some((e) => e.endsWith(".update"))) {
            void applyUpdate(base);
            return;
          }
          if (evs.some((e) => e.endsWith(".delete"))) {
            applyDelete(base);
          }
        }
        const unsub = c.subscribe(
          messageChannel,
          (event: RealtimeResponseEvent<Record<string, unknown>>) => {
            const base = parseBase(event);
            if (!includeMessage(base)) {
              return;
            }
            dispatchByEvents(event.events, base);
          }
        );

        const untrack = trackSubscription(messageChannel);

        return () => {
          untrack();
          unsub();
        };
      })
      .catch(() => {
        /* failed to set up realtime; ignore silently */
      });
  }, [channelId]);

  // realtime subscription for typing indicators
  useEffect(() => {
    if (!channelId) {
      setTypingUsers({});
      return;
    }
    const databaseId = env.databaseId;
    const typingCollectionId = env.collections.typing;
    
    if (!databaseId || !typingCollectionId) {
      return;
    }

    import("@/lib/realtime-pool")
      .then(({ getSharedClient, trackSubscription }) => {
        const c = getSharedClient();
        const typingChannel = `databases.${databaseId}.collections.${typingCollectionId}.documents`;

        function parseTyping(
          event: RealtimeResponseEvent<Record<string, unknown>>
        ) {
          const p = event.payload;
          return {
            $id: String(p.$id),
            userId: String(p.userId),
            userName: p.userName as string | undefined,
            channelId: String(p.channelId),
            updatedAt: String(p.$updatedAt || p.updatedAt),
          };
        }

        function handleTypingEvent(
          event: RealtimeResponseEvent<Record<string, unknown>>
        ) {
          const typing = parseTyping(event);
          
          // Only process typing events for current channel
          if (typing.channelId !== channelId) {
            return;
          }

          // Ignore typing events from current user
          if (typing.userId === userId) {
            return;
          }

          if (event.events.some((e) => e.endsWith(".delete"))) {
            // User stopped typing
            setTypingUsers((prev) => {
              const updated = { ...prev };
              delete updated[typing.userId];
              return updated;
            });
          } else if (
            event.events.some((e) => e.endsWith(".create") || e.endsWith(".update"))
          ) {
            // User is typing or updated their typing status
            setTypingUsers((prev) => ({
              ...prev,
              [typing.userId]: {
                userId: typing.userId,
                userName: typing.userName,
                updatedAt: typing.updatedAt,
              },
            }));
          }
        }

        const unsub = c.subscribe(typingChannel, handleTypingEvent);
        const untrack = trackSubscription(typingChannel);

        return () => {
          untrack();
          unsub();
        };
      })
      .catch(() => {
        /* failed to set up typing realtime; ignore silently */
      });
  }, [channelId, userId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages]);

  // Cleanup stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5000; // Remove typing indicators older than 5 seconds
      
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
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, []);

  async function loadOlder() {
    if (!oldestCursor) {
      return;
    }
    if (!channelId) {
      return;
    }
    try {
      const older = await getEnrichedMessages(pageSize, oldestCursor, channelId);
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
        setOldestCursor(older[0].$id);
        // If we got less than a full page, we've reached the end
        setHasMore(older.length === pageSize);
      } else {
        // No more messages
        setHasMore(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load older messages"
      );
    }
  }

  function startEdit(m: Message) {
    setText(m.text);
    setEditingMessageId(m.$id);
  }

  function cancelEdit() {
    setText("");
    setEditingMessageId(null);
  }

  async function applyEdit(target: Message) {
    try {
      const response = await fetch(`/api/messages?id=${target.$id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to edit message");
      }

      setText("");
      setEditingMessageId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch(`/api/messages?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete message");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function sendTypingState(state: boolean) {
    if (!userId) {
      return;
    }
    if (!channelId) {
      return;
    }
    // Avoid redundant network calls if state and recent timestamp match
    const now = Date.now();
    if (
      state === lastTypingSentState.current &&
      now - lastTypingSentAt.current < typingStartDebounceMs
    ) {
      return;
    }
    lastTypingSentState.current = state;
    lastTypingSentAt.current = now;
    setTyping(userId, channelId, userName || undefined, state).catch(() => {
      /* ignore */
    });
  }

  function scheduleTypingStop() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingState(false);
    }, typingIdleMs);
  }

  function scheduleTypingStart() {
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
    }
    typingDebounceRef.current = setTimeout(() => {
      sendTypingState(true);
    }, typingStartDebounceMs);
  }

  function onChangeText(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    if (!userId) {
      return;
    }
    if (!channelId) {
      return;
    }
    const isTyping = v.trim().length > 0;
    if (isTyping) {
      scheduleTypingStart();
      scheduleTypingStop();
    } else {
      // User cleared input: send stop immediately
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
      }
      sendTypingState(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  }

  async function send(e: React.FormEvent, imageFileId?: string, imageUrl?: string) {
    e.preventDefault();
    if (!userId) {
      return;
    }
    if (!channelId) {
      return;
    }
    const value = text.trim();
    if (!value && !imageFileId) {
      return;
    }

    // If editing, find the message and apply edit
    if (editingMessageId) {
      const targetMessage = messages.find((m) => m.$id === editingMessageId);
      if (targetMessage) {
        await applyEdit(targetMessage);
      }
      return;
    }

    // Otherwise, send a new message
    if (!canSend()) {
      toast.error("You're sending messages too fast");
      return;
    }
    try {
      setText("");
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          channelId,
          serverId: serverId || undefined,
          imageFileId,
          imageUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send message");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  }

  // Determine if we should show the "Load Older" button
  function shouldShowLoadOlder(): boolean {
    // If no messages, don't show button
    if (messages.length === 0) {
      return false;
    }
    
    // If we know there are no more messages, don't show button
    if (!hasMore) {
      return false;
    }
    
    // If we have a cursor and there might be more, show the button
    if (oldestCursor && hasMore) {
      return true;
    }
    
    return false;
  }

  return {
    messages,
    oldestCursor,
    hasMore,
    text,
    editingMessageId,
    typingUsers,
    setTypingUsers,
    listRef,
    loadOlder,
    shouldShowLoadOlder,
    startEdit,
    cancelEdit,
    applyEdit,
    remove,
    onChangeText,
    send,
    userIdSlice,
    maxTypingDisplay,
  };
}
