"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { MoreVertical, MessageSquare, Hash } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Channel } from "@/lib/types";

import { ConversationList } from "./components/ConversationList";
import { DirectMessageView } from "./components/DirectMessageView";
import { useAuth } from "@/contexts/auth-context";
import { useChannels } from "./hooks/useChannels";
import { useMessages } from "./hooks/useMessages";
import { useServers } from "./hooks/useServers";
import { useConversations } from "./hooks/useConversations";
import { useDirectMessages } from "./hooks/useDirectMessages";
import { useActivityTracking } from "./hooks/useActivityTracking";

// Lazy load heavy components
const ServerBrowser = dynamic(() => import("./components/ServerBrowser").then((mod) => ({ default: mod.ServerBrowser })), {
  ssr: false,
});
const UserProfileModal = dynamic(() => import("@/components/user-profile-modal").then((mod) => ({ default: mod.UserProfileModal })), {
  ssr: false,
});
const NewConversationDialog = dynamic(() => import("./components/NewConversationDialog").then((mod) => ({ default: mod.NewConversationDialog })), {
  ssr: false,
});

export default function ChatPage() {
  const { userData } = useAuth();
  const userId = userData?.userId ?? null;
  const userName = userData?.name ?? null;
  
  // Auto track activity and update status
  useActivityTracking({ userId });
  const membershipEnabled = Boolean(
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID
  );
  const [viewMode, setViewMode] = useState<"channels" | "dms">("channels");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{
    userId: string;
    userName?: string;
    displayName?: string;
    avatarUrl?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openProfileModal = (
    profileUserId: string,
    profileUserName?: string,
    profileDisplayName?: string,
    profileAvatarUrl?: string
  ) => {
    setSelectedProfile({
      userId: profileUserId,
      userName: profileUserName,
      displayName: profileDisplayName,
      avatarUrl: profileAvatarUrl,
    });
    setProfileModalOpen(true);
  };
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

  const {
    messages,
    text,
    editingMessageId,
    typingUsers,
    loadOlder,
    shouldShowLoadOlder,
    startEdit,
    cancelEdit,
    applyEdit,
    remove: removeMessage,
    onChangeText,
    send,
    userIdSlice,
    maxTypingDisplay,
  } = messagesApi;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // DM hooks
  const conversationsApi = useConversations(userId);
  const selectedConversation = useMemo(
    () => conversationsApi.conversations.find((c) => c.$id === selectedConversationId),
    [conversationsApi.conversations, selectedConversationId]
  );
  const receiverId = selectedConversation?.otherUser?.userId;
  
  const dmApi = useDirectMessages({
    conversationId: selectedConversationId || "",
    userId,
    receiverId: receiverId || "",
  });

  // Handlers -----------------
  const selectChannel = useCallback((c: Channel) => {
    setSelectedChannel(c.$id);
    setViewMode("channels");
    setSelectedConversationId(null);
  }, []);

  const selectConversation = useCallback((conversation: { $id: string }) => {
    setSelectedConversationId(conversation.$id);
    setViewMode("dms");
    setSelectedChannel(null);
  }, []);

  const confirmDelete = useCallback((messageId: string) => {
    setDeleteConfirmId(messageId);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) {
      return;
    }
    await removeMessage(deleteConfirmId);
    setDeleteConfirmId(null);
  }, [deleteConfirmId, removeMessage]);

  // Derived helpers
  const showChat = useMemo(
    () => Boolean(selectedChannel) || Boolean(selectedConversationId),
    [selectedChannel, selectedConversationId]
  );

  function renderServers() {
    return (
      <div className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Servers</h2>
          <span className="text-xs text-muted-foreground">
            {serversApi.servers.length} total
          </span>
        </div>
        <ul className="space-y-2">
          {serversApi.servers.map((s) => {
            const active = s.$id === serversApi.selectedServer;
            return (
              <li key={s.$id}>
                <Button
                  aria-pressed={active}
                  className={`w-full justify-between rounded-xl transition-colors ${
                    active ? "" : "border border-border/60 bg-background"
                  }`}
                  onClick={() => {
                    serversApi.setSelectedServer(s.$id);
                    setSelectedChannel(null);
                  }}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  <span className="truncate text-left font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">ID {s.$id.slice(0, 4)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
        {serversApi.cursor && (
          <div className="pt-2">
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
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>Memberships</span>
            <span className="font-medium text-foreground">
              {serversApi.memberships.length}
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderChannels() {
    if (!serversApi.selectedServer) {
      return (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
          Select a server to view its channels or create a new space.
        </p>
      );
    }
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
        <ul className="space-y-2">
          {channelsApi.channels.map((c) => {
            const active = c.$id === selectedChannel;
            return (
              <li key={c.$id}>
                <Button
                  aria-pressed={active}
                  className={`w-full justify-between rounded-xl transition-colors ${
                    active ? "" : "border border-border/60 bg-background"
                  }`}
                  onClick={() => selectChannel(c)}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  <span className="truncate text-left font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">#{c.$id.slice(0, 4)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
        {channelsApi.cursor && (
          <div className="pt-2">
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
      </div>
    );
  }

  function renderMessages() {
    if (!showChat) {
      return (
        <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-background/60 p-10 text-center text-sm text-muted-foreground">
          Pick a channel or direct conversation to get started. Your messages will appear here.
        </div>
      );
    }
    return (
      <div
        aria-live="polite"
        className="h-[60vh] overflow-y-auto rounded-3xl border border-border/60 bg-background/70 p-4 shadow-inner"
      >
        {shouldShowLoadOlder() && (
          <div className="mb-4 flex justify-center">
            <Button
              onClick={loadOlder}
              size="sm"
              type="button"
              variant="outline"
            >
              Load older messages
            </Button>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.userId === userId;
          const isEditing = editingMessageId === m.$id;
          const removed = Boolean(m.removedAt);
          const isDeleting = deleteConfirmId === m.$id;
          const displayName = m.displayName || m.userName || m.userId.slice(0, userIdSlice);
          return (
            <div 
              className={`group mb-4 flex gap-3 rounded-2xl border border-transparent bg-background/60 p-3 transition-colors ${
                mine ? "ml-auto max-w-[85%] flex-row-reverse text-right" : "mr-auto max-w-[85%]"
              } ${
                isEditing ? "border-blue-400/50 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-950/30" : "hover:border-border/80"
              }`} 
              key={m.$id}
            >
              <button
                className="shrink-0 cursor-pointer rounded-full border border-transparent transition hover:border-border"
                onClick={() => openProfileModal(m.userId, m.userName, m.displayName, m.avatarUrl)}
                type="button"
              >
                <Avatar
                  alt={displayName}
                  fallback={displayName}
                  size="md"
                  src={m.avatarUrl}
                />
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`flex flex-wrap items-baseline gap-2 text-xs ${mine ? "justify-end" : ""} text-muted-foreground`}
                >
                  <span className="font-medium text-foreground">
                    {displayName}
                  </span>
                  {m.pronouns && (
                    <span className="italic text-muted-foreground">
                      ({m.pronouns})
                    </span>
                  )}
                  <span>{new Date(m.$createdAt).toLocaleTimeString()}</span>
                  {m.editedAt && <span className="italic">(edited)</span>}
                  {removed && <span className="text-destructive">(removed)</span>}
                  {isEditing && (
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Editing...
                    </span>
                  )}
                </div>
                <div className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <div className="max-w-full flex-1 break-words rounded-2xl bg-muted/40 px-3 py-2 text-sm text-foreground">
                    {removed ? (
                      <span className="italic opacity-70">Message removed</span>
                    ) : (
                      m.text
                    )}
                  </div>
                  {mine && !removed && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild disabled={isDeleting}>
                        <Button
                          aria-label="Message options"
                          disabled={isDeleting}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startEdit(m)}>
                          Edit
                        </DropdownMenuItem>
                        {isEditing && (
                          <>
                            <DropdownMenuItem onClick={() => applyEdit(m)}>
                              Save Changes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={cancelEdit}>
                              Cancel Edit
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => confirmDelete(m.$id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {isDeleting && (
                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-destructive/60 bg-destructive/10 p-3 text-left text-sm">
                    <span className="flex-1 text-sm">Delete this message?</span>
                    <Button
                      onClick={handleDelete}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                    <Button
                      onClick={() => setDeleteConfirmId(null)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {Object.values(typingUsers).length > 0 && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            {Object.values(typingUsers)
              .slice(0, maxTypingDisplay)
              .map((t) => t.userName || t.userId.slice(0, userIdSlice))
              .join(", ")}{" "}
            {Object.values(typingUsers).length > maxTypingDisplay
              ? "are typing..."
              : "is typing..."}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  // Show loading skeleton during initial load
  if (serversApi.initialLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-lg">
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-2xl" />
              <Skeleton className="h-10 flex-1 rounded-2xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-9 rounded-2xl" />
                <Skeleton className="h-9 rounded-2xl" />
                <Skeleton className="h-9 rounded-2xl" />
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-5 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-9 rounded-2xl" />
                <Skeleton className="h-9 rounded-2xl" />
              </div>
            </div>
          </aside>
          <div className="space-y-4 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-xl">
            <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground">
              Loading your workspace...
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 flex-1 rounded-2xl" />
              <Skeleton className="h-12 w-24 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-lg">
          {/* View Mode Toggle */}
          <div className="rounded-2xl bg-muted/40 p-1">
            <div className="grid grid-cols-2 gap-1">
              <Button
                aria-pressed={viewMode === "channels"}
                className="rounded-xl"
                onClick={() => {
                  setViewMode("channels");
                  setSelectedConversationId(null);
                }}
                size="sm"
                type="button"
                variant={viewMode === "channels" ? "default" : "ghost"}
              >
                <Hash className="mr-2 h-4 w-4" />
                Channels
              </Button>
              <Button
                aria-pressed={viewMode === "dms"}
                className="rounded-xl"
                onClick={() => {
                  setViewMode("dms");
                  setSelectedChannel(null);
                }}
                size="sm"
                type="button"
                variant={viewMode === "dms" ? "default" : "ghost"}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                DMs
              </Button>
            </div>
          </div>

          {viewMode === "channels" ? (
            <div className="space-y-4">
              {renderServers()}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold tracking-tight">Channels</h2>
                  {selectedChannel && (
                    <span className="rounded-full bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                      Active
                    </span>
                  )}
                </div>
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
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/60 p-2 shadow-sm">
              <ConversationList
                conversations={conversationsApi.conversations}
                loading={conversationsApi.loading}
                onNewConversation={() => setNewConversationOpen(true)}
                onSelectConversation={selectConversation}
                selectedConversationId={selectedConversationId}
              />
            </div>
          )}
        </aside>

        <div className="space-y-4 rounded-3xl border border-border/60 bg-background/70 p-6 shadow-xl">
          {viewMode === "dms" && selectedConversation && userId ? (
            <DirectMessageView
              conversation={selectedConversation}
              currentUserId={userId}
              loading={dmApi.loading}
              messages={dmApi.messages}
              onDelete={dmApi.deleteMsg}
              onEdit={dmApi.edit}
              onSend={dmApi.send}
              sending={dmApi.sending}
            />
          ) : (
            <>
              {renderMessages()}
              <div className="space-y-3">
                {editingMessageId && (
                  <div className="flex items-center justify-between rounded-2xl border border-blue-200/60 bg-blue-50/60 px-4 py-3 text-sm dark:border-blue-500/40 dark:bg-blue-950/30">
                    <span className="text-blue-700 dark:text-blue-300">
                      Editing message
                    </span>
                    <Button
                      onClick={cancelEdit}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {editingMessageId ? (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                      aria-label="Edit message"
                      className="flex-1 rounded-2xl border-border/60 ring-2 ring-blue-500/40"
                      onChange={onChangeText}
                      placeholder="Edit your message..."
                      value={text}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(e);
                        }
                        if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={(e) => {
                          void send(e);
                        }}
                        type="button"
                        variant="default"
                      >
                        Save
                      </Button>
                      <Button
                        onClick={cancelEdit}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={send}>
                    <Input
                      aria-label="Message"
                      disabled={!showChat}
                      onChange={onChangeText}
                      placeholder={showChat ? "Type a message" : "Select a channel"}
                      value={text}
                      className="flex-1 rounded-2xl border-border/60"
                    />
                    <Button
                      className="rounded-2xl"
                      disabled={!showChat}
                      type="submit"
                    >
                      Send
                    </Button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* User Profile Modal */}
      {selectedProfile && (
        <UserProfileModal
          avatarUrl={selectedProfile.avatarUrl}
          displayName={selectedProfile.displayName}
          onOpenChange={setProfileModalOpen}
          open={profileModalOpen}
          userId={selectedProfile.userId}
          userName={selectedProfile.userName}
          onStartDM={(conversationId) => {
            setSelectedConversationId(conversationId);
            setViewMode("dms");
            setSelectedChannel(null);
            setProfileModalOpen(false);
          }}
        />
      )}

      {/* New Conversation Dialog */}
      {userId && (
        <NewConversationDialog
          currentUserId={userId}
          onConversationCreated={(conversation) => {
            setSelectedConversationId(conversation.$id);
            setViewMode("dms");
            setSelectedChannel(null);
            setNewConversationOpen(false);
          }}
          onOpenChange={setNewConversationOpen}
          open={newConversationOpen}
        />
      )}
    </div>
  );
}
