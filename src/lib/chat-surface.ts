import type { DirectMessage, Message } from "@/lib/types";
import { resolveMessageImageUrl } from "@/lib/message-image-url";

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
    authorAvatarFramePreset?: string;
    authorAvatarFrameUrl?: string;
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
    poll?: Message["poll"];
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
    threadHasUnread?: boolean;
    threadLastReadAt?: string;
};

/**
 * Normalizes reaction payloads into a cloned MessageReaction array.
 * Returns undefined when reactions are absent or not in an array shape.
 *
 * @param {Message["reactions"] | DirectMessage["reactions"]} reactions - Source reactions from a message payload.
 * @returns {MessageReaction[] | undefined} Normalized reaction entries, or undefined when no valid reactions exist.
 */
function cloneReactions(
    reactions: Message["reactions"] | DirectMessage["reactions"],
): MessageReaction[] | undefined {
    if (!reactions || !Array.isArray(reactions)) {
        return undefined;
    }

    return reactions
        .filter((reaction): reaction is MessageReaction =>
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

function clonePoll(
    poll: Message["poll"] | DirectMessage["poll"],
): Message["poll"] | undefined {
    if (!poll) {
        return undefined;
    }

    if (typeof globalThis.structuredClone === "function") {
        return globalThis.structuredClone(poll);
    }

    const safeOptions = Array.isArray(poll.options) ? poll.options : [];

    return {
        ...poll,
        options: safeOptions.map((option) => ({
            ...option,
            voterIds: Array.isArray(option.voterIds) ? [...option.voterIds] : [],
        })),
    };
}

/**
 * Creates channel context.
 *
 * @param {Message} message - The message value.
 * @returns {{ kind: 'channel'; channelId: string; serverId?: string | undefined; }} The return value.
 */
function createChannelContext(
    message: Message,
): Extract<ChatSurfaceContext, { kind: "channel" }> {
    return {
        kind: "channel",
        channelId: message.channelId ?? "",
        serverId: message.serverId,
    };
}

/**
 * Creates dm context.
 *
 * @param {DirectMessage} message - The message value.
 * @param {Omit<{ kind: 'dm'; conversationId: string; isGroup?: boolean | undefined; readOnly?: boolean | undefined; readOnlyReason?: string | null | undefined; }, 'kind' | 'conversationId'> | undefined} overrides - The overrides value, if provided.
 * @returns {{ kind: 'dm'; conversationId: string; isGroup?: boolean | undefined; readOnly?: boolean | undefined; readOnlyReason?: string | null | undefined; }} The return value.
 */
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

/**
 * Handles from channel message.
 *
 * @param {Message} message - The message value.
 * @param {{ kind: 'channel'; channelId: string; serverId?: string | undefined; }} context - The context value, if provided.
 * @returns {{ id: string; sourceType: 'channel' | 'dm'; sourceMessageId: string; context: ChatSurfaceContext; authorId: string; authorUserName?: string | undefined; authorLabel: string; authorAvatarUrl?: string | undefined; authorPronouns?: string | undefined; text: string; createdAt: string; editedAt?: string | undefined; removedAt?: string | undefined; removedBy?: string | undefined; imageFileId?: string | undefined; imageUrl?: string | undefined; attachments?: any; replyToId?: string | undefined; replyTo?: ChatSurfaceReplyPreview | undefined; threadId?: string | undefined; threadReplyCount?: number | undefined; threadParticipants?: string[] | undefined; lastThreadReplyAt?: string | undefined; mentions?: string[] | undefined; reactions?: any[] | undefined; isPinned?: boolean | undefined; pinnedAt?: string | undefined; pinnedBy?: string | undefined; threadHasUnread?: boolean | undefined; threadLastReadAt?: string | undefined; }} The return value.
 */
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
        authorAvatarFramePreset: message.avatarFramePreset,
        authorAvatarFrameUrl: message.avatarFrameUrl,
        authorPronouns: message.pronouns,
        text: message.text,
        createdAt: message.$createdAt,
        editedAt: message.editedAt,
        removedAt: message.removedAt,
        removedBy: message.removedBy,
        imageFileId: message.imageFileId,
        imageUrl: resolveMessageImageUrl({
            imageFileId: message.imageFileId,
            imageUrl: message.imageUrl,
        }),
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
        poll: clonePoll(message.poll),
        isPinned: message.isPinned,
        pinnedAt: message.pinnedAt,
        pinnedBy: message.pinnedBy,
    };
}

/**
 * Handles from direct message.
 *
 * @param {DirectMessage} message - The message value.
 * @param {{ kind: 'dm'; conversationId: string; isGroup?: boolean | undefined; readOnly?: boolean | undefined; readOnlyReason?: string | null | undefined; }} context - The context value, if provided.
 * @returns {{ id: string; sourceType: 'channel' | 'dm'; sourceMessageId: string; context: ChatSurfaceContext; authorId: string; authorUserName?: string | undefined; authorLabel: string; authorAvatarUrl?: string | undefined; authorPronouns?: string | undefined; text: string; createdAt: string; editedAt?: string | undefined; removedAt?: string | undefined; removedBy?: string | undefined; imageFileId?: string | undefined; imageUrl?: string | undefined; attachments?: any; replyToId?: string | undefined; replyTo?: ChatSurfaceReplyPreview | undefined; threadId?: string | undefined; threadReplyCount?: number | undefined; threadParticipants?: string[] | undefined; lastThreadReplyAt?: string | undefined; mentions?: string[] | undefined; reactions?: any[] | undefined; isPinned?: boolean | undefined; pinnedAt?: string | undefined; pinnedBy?: string | undefined; threadHasUnread?: boolean | undefined; threadLastReadAt?: string | undefined; }} The return value.
 */
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
        authorAvatarFramePreset: message.senderAvatarFramePreset,
        authorAvatarFrameUrl: message.senderAvatarFrameUrl,
        authorPronouns: message.senderPronouns,
        text: message.text,
        createdAt: message.$createdAt,
        editedAt: message.editedAt,
        removedAt: message.removedAt,
        removedBy: message.removedBy,
        imageFileId: message.imageFileId,
        imageUrl: resolveMessageImageUrl({
            imageFileId: message.imageFileId,
            imageUrl: message.imageUrl,
        }),
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
        poll: clonePoll(message.poll),
        isPinned: message.isPinned ?? false,
        pinnedAt: message.pinnedAt,
        pinnedBy: message.pinnedBy,
    };
}

/**
 * Handles adapt channel messages.
 *
 * @param {Message[]} messages - The messages value.
 * @param {{ kind: 'channel'; channelId: string; serverId?: string | undefined; } | undefined} context - The context value, if provided.
 * @returns {ChatSurfaceMessage[]} The return value.
 */
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

/**
 * Handles adapt direct messages.
 *
 * @param {DirectMessage[]} messages - The messages value.
 * @param {{ kind: 'dm'; conversationId: string; isGroup?: boolean | undefined; readOnly?: boolean | undefined; readOnlyReason?: string | null | undefined; } | undefined} context - The context value, if provided.
 * @returns {ChatSurfaceMessage[]} The return value.
 */
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
