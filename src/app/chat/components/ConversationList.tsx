"use client";

import { MessageSquare, Plus, MoreVertical, BellOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Conversation } from "@/lib/types";

type ConversationListProps = {
    conversations: Conversation[];
    loading: boolean;
    selectedConversationId: string | null;
    onSelectConversation: (conversation: Conversation) => void;
    onNewConversation: () => void;
    onMuteConversation?: (
        conversationId: string,
        conversationName: string,
    ) => void;
};

export function ConversationList({
    conversations,
    loading,
    selectedConversationId,
    onSelectConversation,
    onNewConversation,
    onMuteConversation,
}: ConversationListProps) {
    if (loading) {
        return (
            <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div className="flex items-center gap-3 p-2" key={i}>
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-border border-b p-3">
                <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <MessageSquare className="size-4" />
                    Direct Messages
                </h3>
                <Button
                    onClick={onNewConversation}
                    size="sm"
                    title="New conversation"
                    variant="ghost"
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                        <MessageSquare className="mb-2 size-8 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                            No conversations yet
                        </p>
                        <Button
                            className="mt-3"
                            onClick={onNewConversation}
                            size="sm"
                            variant="outline"
                        >
                            Start a conversation
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-1 p-2">
                        {conversations.map((conversation) => {
                            const isSelected =
                                conversation.$id === selectedConversationId;
                            const isGroup =
                                conversation.isGroup ||
                                (conversation.participants?.length ?? 0) > 2;
                            const otherUser = conversation.otherUser;
                            const participantCount =
                                conversation.participantCount ??
                                conversation.participants.length;
                            const displayName = isGroup
                                ? conversation.name || "Group DM"
                                : otherUser?.displayName ||
                                  otherUser?.userId ||
                                  "Unknown User";
                            const subtitle = isGroup
                                ? `${participantCount} participants`
                                : otherUser?.status
                                  ? otherUser.status
                                  : undefined;

                            return (
                                <div
                                    className="group relative flex items-center gap-1"
                                    key={conversation.$id}
                                >
                                    <button
                                        className={`flex flex-1 items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                                            isSelected
                                                ? "bg-accent"
                                                : "hover:bg-accent/50"
                                        }`}
                                        onClick={() =>
                                            onSelectConversation(conversation)
                                        }
                                        type="button"
                                    >
                                        <div className="relative">
                                            <Avatar
                                                alt={displayName}
                                                fallback={displayName}
                                                size="md"
                                                src={
                                                    isGroup
                                                        ? conversation.avatarUrl
                                                        : otherUser?.avatarUrl
                                                }
                                            />
                                            {!isGroup && otherUser?.status && (
                                                <div className="absolute -bottom-0.5 -right-0.5">
                                                    <StatusIndicator
                                                        size="sm"
                                                        status={
                                                            otherUser.status as
                                                                | "online"
                                                                | "away"
                                                                | "busy"
                                                                | "offline"
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p className="truncate font-medium text-sm">
                                                    {displayName}
                                                </p>
                                                {conversation.lastMessageAt && (
                                                    <span className="text-muted-foreground text-xs">
                                                        {new Date(
                                                            conversation.lastMessageAt,
                                                        ).toLocaleTimeString(
                                                            [],
                                                            {
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            },
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                            {(conversation.lastMessage ||
                                                subtitle) && (
                                                <p className="truncate text-muted-foreground text-xs">
                                                    {conversation.lastMessage
                                                        ?.text || subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                    {onMuteConversation && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                    <span className="sr-only">
                                                        Conversation options
                                                    </span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        onMuteConversation(
                                                            conversation.$id,
                                                            displayName,
                                                        )
                                                    }
                                                >
                                                    <BellOff className="mr-2 h-4 w-4" />
                                                    Mute Conversation
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
