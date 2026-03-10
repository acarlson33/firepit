import type { DirectMessage, Message } from "@/lib/types";

type MessageReaction = NonNullable<Message["reactions"]>[number];

export type ChatSurfaceReplyPreview = {
    messageId?: string;
    text: string;
    authorId?: string;
    authorLabel?: string;
};

export type ChatSurfaceContext =
    | {
          kind: "channel";
          channelId: string;
          serverId?: string;
      }
    | {
          kind: "dm";
          conversationId: string;
          isGroup?: boolean;
          readOnly?: boolean;
          readOnlyReason?: string | null;
      };

export type ChatSurfaceMessage = {
    id: string;
    sourceType: "channel" | "dm";
    sourceMessageId: string;
    context: ChatSurfaceContext;
    authorId: string;
    authorUserName?: string;
    authorLabel: string;
    authorAvatarUrl?: string;
    authorPronouns?: string;
    text: string;
    createdAt: string;
    editedAt?: string;
    removedAt?: string;
    removedBy?: string;
    imageFileId?: string;
    imageUrl?: string;
    attachments?: Message["attachments"];
    replyToId?: string;
    replyTo?: ChatSurfaceReplyPreview;
    threadId?: string;
    threadReplyCount?: number;
    threadParticipants?: string[];
    lastThreadReplyAt?: string;
    mentions?: string[];
    reactions?: MessageReaction[];
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
};

function cloneReactions(
    reactions: Message["reactions"] | DirectMessage["reactions"],
): MessageReaction[] | undefined {
    if (!reactions || !Array.isArray(reactions)) {
        return undefined;
    }

    return reactions
        .filter(
            (reaction): reaction is MessageReaction =>
                Boolean(
                    reaction &&
                        typeof reaction.emoji === "string" &&
                        Array.isArray(reaction.userIds) &&
                        typeof reaction.count === "number",
                ),
        )
        .map((reaction) => ({
            emoji: reaction.emoji,
            userIds: [...reaction.userIds],
            count: reaction.count,
        }));
}

function createChannelContext(
    message: Message,
): Extract<ChatSurfaceContext, { kind: "channel" }> {
    return {
        kind: "channel",
        channelId: message.channelId ?? "",
        serverId: message.serverId,
    };
}

function createDmContext(
    message: DirectMessage,
    overrides?: Omit<
        Extract<ChatSurfaceContext, { kind: "dm" }>,
        "kind" | "conversationId"
    >,
): Extract<ChatSurfaceContext, { kind: "dm" }> {
    return {
        kind: "dm",
        conversationId: message.conversationId,
        isGroup: overrides?.isGroup,
        readOnly: overrides?.readOnly,
        readOnlyReason: overrides?.readOnlyReason,
    };
}

function sortByCreatedAt<T extends { createdAt: string; id: string }>(
    items: T[],
): T[] {
    return [...items].sort((left, right) => {
        const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
        if (createdAtOrder !== 0) {
            return createdAtOrder;
        }

        return left.id.localeCompare(right.id);
    });
}

export function fromChannelMessage(
    message: Message,
    context: Extract<
        ChatSurfaceContext,
        { kind: "channel" }
    > = createChannelContext(message),
): ChatSurfaceMessage {
    return {
        id: message.$id,
        sourceType: "channel",
        sourceMessageId: message.$id,
        context,
        authorId: message.userId,
        authorUserName: message.userName,
        authorLabel: message.displayName || message.userName || message.userId,
        authorAvatarUrl: message.avatarUrl,
        authorPronouns: message.pronouns,
        text: message.text,
        createdAt: message.$createdAt,
        editedAt: message.editedAt,
        removedAt: message.removedAt,
        removedBy: message.removedBy,
        imageFileId: message.imageFileId,
        imageUrl: message.imageUrl,
        attachments: message.attachments,
        replyToId: message.replyToId,
        replyTo: message.replyTo
            ? {
                  text: message.replyTo.text,
                  authorLabel:
                      message.replyTo.displayName || message.replyTo.userName,
              }
            : undefined,
        threadId: message.threadId,
        threadReplyCount:
            message.threadReplyCount ?? message.threadMessageCount,
        threadParticipants: message.threadParticipants
            ? [...message.threadParticipants]
            : undefined,
        lastThreadReplyAt: message.lastThreadReplyAt,
        mentions: message.mentions ? [...message.mentions] : undefined,
        reactions: cloneReactions(message.reactions),
        isPinned: message.isPinned,
        pinnedAt: message.pinnedAt,
        pinnedBy: message.pinnedBy,
    };
}

export function fromDirectMessage(
    message: DirectMessage,
    context: Extract<ChatSurfaceContext, { kind: "dm" }> = createDmContext(
        message,
    ),
): ChatSurfaceMessage {
    return {
        id: message.$id,
        sourceType: "dm",
        sourceMessageId: message.$id,
        context,
        authorId: message.senderId,
        authorLabel: message.senderDisplayName || message.senderId,
        authorAvatarUrl: message.senderAvatarUrl,
        authorPronouns: message.senderPronouns,
        text: message.text,
        createdAt: message.$createdAt,
        editedAt: message.editedAt,
        removedAt: message.removedAt,
        removedBy: message.removedBy,
        imageFileId: message.imageFileId,
        imageUrl: message.imageUrl,
        attachments: message.attachments,
        replyToId: message.replyToId,
        replyTo: message.replyTo
            ? {
                  text: message.replyTo.text,
                  authorLabel: message.replyTo.senderDisplayName,
              }
            : undefined,
        threadId: message.threadId,
        threadReplyCount: message.threadMessageCount,
        threadParticipants: message.threadParticipants
            ? [...message.threadParticipants]
            : undefined,
        lastThreadReplyAt: message.lastThreadReplyAt,
        mentions: message.mentions ? [...message.mentions] : undefined,
        reactions: cloneReactions(message.reactions),
        isPinned: false,
    };
}

export function adaptChannelMessages(
    messages: Message[],
    context?: Extract<ChatSurfaceContext, { kind: "channel" }>,
): ChatSurfaceMessage[] {
    return sortByCreatedAt(
        messages.map((message) =>
            fromChannelMessage(
                message,
                context ?? createChannelContext(message),
            ),
        ),
    );
}

export function adaptDirectMessages(
    messages: DirectMessage[],
    context?: Extract<ChatSurfaceContext, { kind: "dm" }>,
): ChatSurfaceMessage[] {
    return sortByCreatedAt(
        messages.map((message) =>
            fromDirectMessage(message, context ?? createDmContext(message)),
        ),
    );
}
