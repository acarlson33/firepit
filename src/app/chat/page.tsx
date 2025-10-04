"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Channel } from "@/lib/types";
import { ConfirmDialog, type ConfirmState } from "./components/ConfirmDialog";
import { ServerBrowser } from "./components/ServerBrowser";
import { useAuth } from "./hooks/useAuth";
import { useChannels } from "./hooks/useChannels";
import { useMessages } from "./hooks/useMessages";
import { useServers } from "./hooks/useServers";

export default function ChatPage() {
  const { userId, userName } = useAuth();
  const membershipEnabled = Boolean(
    process.env.NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID
  );
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const serversApi = useServers({ userId, membershipEnabled });
  const channelsApi = useChannels({
    selectedServer: serversApi.selectedServer,
    userId,
    servers: serversApi.servers,
  });
  const messagesApi = useMessages({
    channelId:
      channelsApi.channels.find((c) => c.$id === selectedChannel)?.$id ||
      selectedChannel,
    serverId: serversApi.selectedServer,
    userId,
    userName,
  });
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const {
    messages,
    oldestCursor,
    text,
    typingUsers,
    loadOlder,
    startEdit,
    applyEdit,
    remove: removeMessage,
    onChangeText,
    send,
    userIdSlice,
    maxTypingDisplay,
  } = messagesApi;

  // Handlers -----------------
  function selectChannel(c: Channel) {
    setSelectedChannel(c.$id);
  }

  async function handleDeleteServer(id: string) {
    try {
      await serversApi.remove(id);
      if (serversApi.selectedServer === id) {
        setSelectedChannel(null);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete server"
      );
    }
  }

  async function handleDeleteChannel(channel: Channel) {
    try {
      await channelsApi.remove(channel);
      if (selectedChannel === channel.$id) {
        setSelectedChannel(null);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete channel"
      );
    }
  }

  // Derived helpers
  const showChat = Boolean(selectedChannel);

  function handleConfirm(state: Exclude<ConfirmState, null>) {
    if (state.type === "server") {
      handleDeleteServer(state.id)
        .catch(() => {
          // swallow deletion error (non-critical UI action)
        })
        .finally(() => setConfirmState(null));
      return;
    }
    const channel = channelsApi.channels.find((c) => c.$id === state.id);
    if (channel) {
      handleDeleteChannel(channel)
        .catch(() => {
          // swallow deletion error (non-critical UI action)
        })
        .finally(() => setConfirmState(null));
      return;
    }
    setConfirmState(null);
  }

  function renderServers() {
    return (
      <div>
        <h2 className="mb-2 font-semibold text-sm">Servers</h2>
        <ul className="mb-2 space-y-1">
          {serversApi.servers.map((s) => {
            const isOwner = s.ownerId === userId;
            const active = s.$id === serversApi.selectedServer;
            return (
              <li className="flex items-center gap-1" key={s.$id}>
                <Button
                  className="w-full justify-start"
                  onClick={() => {
                    serversApi.setSelectedServer(s.$id);
                    setSelectedChannel(null);
                  }}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  {s.name}
                </Button>
                {isOwner && (
                  <Button
                    aria-label="Delete server"
                    onClick={() =>
                      setConfirmState({
                        type: "server",
                        id: s.$id,
                        name: s.name,
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    ✕
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {serversApi.cursor && (
          <div className="mb-2">
            <Button
              disabled={serversApi.loading}
              onClick={serversApi.loadMore}
              size="sm"
              type="button"
              variant="outline"
            >
              {serversApi.loading ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
        {serversApi.membershipEnabled && (
          <div className="mt-2 text-muted-foreground text-xs">
            Memberships: {serversApi.memberships.length}
          </div>
        )}
      </div>
    );
  }

  function renderChannels() {
    if (!serversApi.selectedServer) {
      return (
        <p className="text-muted-foreground text-xs">
          Select a server or create one.
        </p>
      );
    }
    return (
      <>
        <ul className="mb-2 space-y-1">
          {channelsApi.channels.map((c) => {
            const isOwner = channelsApi.isOwner(c.serverId);
            const active = c.$id === selectedChannel;
            return (
              <li className="flex items-center gap-1" key={c.$id}>
                <Button
                  className="w-full justify-start"
                  onClick={() => selectChannel(c)}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  {c.name}
                </Button>
                {isOwner && (
                  <Button
                    aria-label="Delete channel"
                    onClick={() =>
                      setConfirmState({
                        type: "channel",
                        id: c.$id,
                        name: c.name,
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    ✕
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {channelsApi.cursor && (
          <div className="mb-2">
            <Button
              disabled={channelsApi.loading}
              onClick={channelsApi.loadMore}
              size="sm"
              type="button"
              variant="outline"
            >
              {channelsApi.loading ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </>
    );
  }

  function renderMessages() {
    if (!showChat) {
      return (
        <div className="flex h-[60vh] items-center justify-center rounded-md border p-6 text-muted-foreground text-sm">
          Select a channel to start chatting.
        </div>
      );
    }
    return (
      <div
        aria-live="polite"
        className="h-[60vh] overflow-y-auto rounded-md border p-3"
      >
        <div className="mb-2 flex justify-center">
          {oldestCursor && (
            <Button
              onClick={loadOlder}
              size="sm"
              type="button"
              variant="outline"
            >
              Load older
            </Button>
          )}
        </div>
        {messages.map((m) => {
          const mine = m.userId === userId;
          const showSave = messagesApi.text && messagesApi.text !== m.text;
          const removed = Boolean(m.removedAt);
          return (
            <div className="mb-3" key={m.$id}>
              <div className="flex items-baseline gap-2 text-muted-foreground text-xs">
                <span className="font-medium">
                  {m.userName || m.userId.slice(0, userIdSlice)}
                </span>
                <span>{new Date(m.$createdAt).toLocaleTimeString()}</span>
                {m.editedAt && <span className="italic">(edited)</span>}
                {removed && <span className="text-destructive">(removed)</span>}
              </div>
              <div className="flex items-start gap-2">
                <div className="flex-1 break-words">
                  {removed ? (
                    <span className="italic opacity-70">Message removed</span>
                  ) : (
                    m.text
                  )}
                </div>
                {mine && (
                  <div className="flex gap-1">
                    <Button
                      onClick={() => startEdit(m)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => removeMessage(m.$id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Del
                    </Button>
                    {showSave && (
                      <Button
                        onClick={() => applyEdit(m)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Save
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {Object.values(typingUsers).length > 0 && (
          <div className="mt-4 text-muted-foreground text-xs">
            {Object.values(typingUsers)
              .slice(0, maxTypingDisplay)
              .map((t) => t.userName || t.userId.slice(0, userIdSlice))
              .join(", ")}{" "}
            {Object.values(typingUsers).length > maxTypingDisplay
              ? "are typing..."
              : "is typing..."}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto flex gap-4 px-4 py-6">
      <aside className="w-64 shrink-0 space-y-6 rounded-md border p-3">
        {renderServers()}
        <div>
          <h2 className="mb-2 font-semibold text-sm">Channels</h2>
          {renderChannels()}
        </div>
        <ServerBrowser
          membershipEnabled={membershipEnabled}
          userId={userId}
          joinedServerIds={serversApi.servers.map((s) => s.$id)}
          onServerJoined={() => {
            // Reload the page to refresh server list
            window.location.reload();
          }}
        />
      </aside>
      <div className="flex-1">
        <div className="grid max-w-3xl grid-rows-[1fr_auto] gap-4">
          {renderMessages()}
          <form className="flex items-center gap-2" onSubmit={send}>
            <Input
              aria-label="Message"
              disabled={!showChat}
              onChange={onChangeText}
              placeholder={showChat ? "Type a message" : "Select a channel"}
              value={text}
            />
            <Button disabled={!showChat} type="submit">
              Send
            </Button>
          </form>
        </div>
      </div>
      <ConfirmDialog
        onCancel={() => setConfirmState(null)}
        onConfirm={handleConfirm}
        state={confirmState}
      />
    </div>
  );
}
