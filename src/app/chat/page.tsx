"use client";
import { useState } from "react";
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
import { UserProfileModal } from "@/components/user-profile-modal";
import type { Channel } from "@/lib/types";

import { ServerBrowser } from "./components/ServerBrowser";
import { ConversationList } from "./components/ConversationList";
import { DirectMessageView } from "./components/DirectMessageView";
import { NewConversationDialog } from "./components/NewConversationDialog";
import { useAuth } from "./hooks/useAuth";
import { useChannels } from "./hooks/useChannels";
import { useMessages } from "./hooks/useMessages";
import { useServers } from "./hooks/useServers";
import { useConversations } from "./hooks/useConversations";
import { useDirectMessages } from "./hooks/useDirectMessages";
import { useActivityTracking } from "./hooks/useActivityTracking";

export default function ChatPage() {
  const { userId, userName } = useAuth();
  
  // Auto track activity and update status
  useActivityTracking({ userId });
  const membershipEnabled = Boolean(
    process.env.NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID
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

  // DM hooks
  const conversationsApi = useConversations(userId);
  const selectedConversation = conversationsApi.conversations.find(
    (c) => c.$id === selectedConversationId
  );
  const receiverId = selectedConversation?.otherUser?.userId;
  
  const dmApi = useDirectMessages({
    conversationId: selectedConversationId || "",
    userId,
    receiverId: receiverId || "",
  });

  // Handlers -----------------
  function selectChannel(c: Channel) {
    setSelectedChannel(c.$id);
    setViewMode("channels");
    setSelectedConversationId(null);
  }

  function selectConversation(conversation: { $id: string }) {
    setSelectedConversationId(conversation.$id);
    setViewMode("dms");
    setSelectedChannel(null);
  }

  function confirmDelete(messageId: string) {
    setDeleteConfirmId(messageId);
  }

  async function handleDelete() {
    if (!deleteConfirmId) {
      return;
    }
    await removeMessage(deleteConfirmId);
    setDeleteConfirmId(null);
  }

  // Derived helpers
  const showChat = Boolean(selectedChannel) || Boolean(selectedConversationId);

  function renderServers() {
    return (
      <div>
        <h2 className="mb-2 font-semibold text-sm">Servers</h2>
        <ul className="mb-2 space-y-1">
          {serversApi.servers.map((s) => {
            const active = s.$id === serversApi.selectedServer;
            return (
              <li key={s.$id}>
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
            const active = c.$id === selectedChannel;
            return (
              <li key={c.$id}>
                <Button
                  className="w-full justify-start"
                  onClick={() => selectChannel(c)}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  {c.name}
                </Button>
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
        {shouldShowLoadOlder() && (
          <div className="mb-3 flex justify-center">
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
              className={`mb-3 flex gap-3 rounded-lg p-2 transition-colors ${
                isEditing ? "bg-blue-50 dark:bg-blue-950/20 ring-2 ring-blue-500/50" : ""
              }`} 
              key={m.$id}
            >
              <button
                className="shrink-0 cursor-pointer transition-opacity hover:opacity-80"
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
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2 text-muted-foreground text-xs">
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
                <div className="flex items-start gap-2">
                  <div className="flex-1 break-words">
                    {removed ? (
                      <span className="italic opacity-70">Message removed</span>
                    ) : (
                      m.text
                    )}
                  </div>
                  {mine && !removed && (
                    <DropdownMenu open={isDeleting ? false : undefined}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Message options"
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
                  <div className="mt-2 flex items-center gap-2 rounded border border-destructive bg-destructive/10 p-2">
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

  // Show loading skeleton during initial load
  if (serversApi.initialLoading) {
    return (
      <div className="container mx-auto flex gap-4 px-4 py-6">
        <aside className="w-64 shrink-0 space-y-6 rounded-md border p-3">
          <div>
            <Skeleton className="mb-2 h-5 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
          <div>
            <Skeleton className="mb-2 h-5 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        </aside>
        <div className="flex-1">
          <div className="grid max-w-3xl grid-rows-[1fr_auto] gap-4">
            <div className="flex h-[60vh] items-center justify-center rounded-md border p-6 text-muted-foreground text-sm">
              Loading...
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-16" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex gap-4 px-4 py-6">
      <aside className="w-64 shrink-0 space-y-6 rounded-md border p-3">
        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              setViewMode("channels");
              setSelectedConversationId(null);
            }}
            size="sm"
            type="button"
            variant={viewMode === "channels" ? "default" : "outline"}
          >
            <Hash className="mr-2 h-4 w-4" />
            Channels
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setViewMode("dms");
              setSelectedChannel(null);
            }}
            size="sm"
            type="button"
            variant={viewMode === "dms" ? "default" : "outline"}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            DMs
          </Button>
        </div>

        {viewMode === "channels" ? (
          <>
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
          </>
        ) : (
          <ConversationList
            conversations={conversationsApi.conversations}
            loading={conversationsApi.loading}
            onNewConversation={() => setNewConversationOpen(true)}
            onSelectConversation={selectConversation}
            selectedConversationId={selectedConversationId}
          />
        )}
      </aside>
      <div className="flex-1">
        <div className="grid max-w-3xl grid-rows-[1fr_auto] gap-4">
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
              <div className="space-y-2">
                {editingMessageId && (
                  <div className="flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-sm dark:bg-blue-950/20">
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
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Edit message"
                      className="ring-2 ring-blue-500/50"
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
                ) : (
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
