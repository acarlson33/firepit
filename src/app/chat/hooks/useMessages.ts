"use client";
import type { RealtimeResponseEvent } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  canSend,
  deleteMessage,
  editMessage,
  listRecentMessages,
  sendMessage,
  setTyping,
} from "@/lib/appwrite-messages";
import type { Message } from "@/lib/types";

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
  const [text, setText] = useState("");
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
      return;
    }
    (async () => {
      try {
        const initial = await listRecentMessages(
          pageSize,
          undefined,
          channelId
        );
        setMessages(initial);
        if (initial.length) {
          setOldestCursor(initial[0].$id);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load messages"
        );
      }
    })().catch(() => {
      /* error already surfaced via toast */
    });
  }, [channelId]);

  // realtime subscription
  useEffect(() => {
    if (!channelId) {
      return;
    }
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
    const collectionId =
      process.env.NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID;
    const missing = [endpoint, project, databaseId, collectionId].some(
      (v) => !v
    );
    if (missing) {
      return;
    }

    import("appwrite")
      .then(({ Client }) => {
        const c = new Client()
          .setEndpoint(endpoint as string)
          .setProject(project as string);
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
            createdAt: String(p.createdAt),
            editedAt: p.editedAt as string | undefined,
            channelId: p.channelId as string | undefined,
            removedAt: p.removedAt as string | undefined,
            removedBy: p.removedBy as string | undefined,
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
        function applyCreate(base: Message) {
          setMessages((prev) =>
            [...prev, base].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            )
          );
        }
        function applyUpdate(base: Message) {
          setMessages((prev) =>
            prev.map((m) => (m.$id === base.$id ? { ...m, ...base } : m))
          );
        }
        function applyDelete(base: Message) {
          setMessages((prev) => prev.filter((m) => m.$id !== base.$id));
        }
        function dispatchByEvents(evs: string[], base: Message) {
          if (evs.some((e) => e.endsWith(".create"))) {
            applyCreate(base);
            return;
          }
          if (evs.some((e) => e.endsWith(".update"))) {
            applyUpdate(base);
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

        return () => {
          unsub();
        };
      })
      .catch(() => {
        /* failed to set up realtime; ignore silently */
      });
  }, [channelId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  });

  async function loadOlder() {
    if (!oldestCursor) {
      return;
    }
    if (!channelId) {
      return;
    }
    try {
      const older = await listRecentMessages(pageSize, oldestCursor, channelId);
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
        setOldestCursor(older[0].$id);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load older messages"
      );
    }
  }

  function startEdit(m: Message) {
    setText(m.text);
  }

  async function applyEdit(target: Message) {
    try {
      await editMessage(target.$id, text.trim());
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
    }
  }

  async function remove(id: string) {
    try {
      await deleteMessage(id);
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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      return;
    }
    if (!channelId) {
      return;
    }
    const value = text.trim();
    if (!value) {
      return;
    }
    if (!canSend()) {
      toast.error("You're sending messages too fast");
      return;
    }
    try {
      setText("");
      await sendMessage({
        userId,
        text: value,
        userName: userName || undefined,
        channelId,
        serverId: serverId || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  }

  return {
    messages,
    oldestCursor,
    text,
    typingUsers,
    setTypingUsers,
    listRef,
    loadOlder,
    startEdit,
    applyEdit,
    remove,
    onChangeText,
    send,
    userIdSlice,
    maxTypingDisplay,
  };
}
