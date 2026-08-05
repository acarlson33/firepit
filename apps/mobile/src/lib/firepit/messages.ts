import { firepitRequest } from "@/lib/firepit/http";
import type {
    InboxContextKind,
    InboxDigestResponse,
    DirectMessageConversation,
    DirectMessageConversationResponse,
    DirectMessageConversationsResponse,
    DirectMessageMessagesResponse,
    DirectMessage,
    Message,
    MessageAttachment,
    MessageListResponse,
    SearchMessagesResponse,
    ThreadMessagesResponse,
    CustomEmoji,
    CustomEmojiListResponse,
    RelationshipStatus,
    FriendsResponse,
    BlockedUsersResponse,
} from "@/lib/firepit/types";

export type CreateChannelMessageInput = {
    channelId: string;
    serverId?: string;
    text?: string;
    replyToId?: string;
    mentions?: string[];
    imageFileId?: string;
    imageUrl?: string;
    attachments?: MessageAttachment[];
};

export type ThreadReplyInput = {
    text?: string;
    mentions?: string[];
    imageFileId?: string;
    imageUrl?: string;
    attachments?: MessageAttachment[];
};

export type InboxScope = "all" | "direct" | "server";

export type SendDirectMessageInput = {
    conversationId: string;
    senderId?: string;
    receiverId?: string;
    text?: string;
    isEncrypted?: boolean;
    encryptedText?: string;
    encryptionNonce?: string;
    encryptionVersion?: string;
    encryptionSenderPublicKey?: string;
    imageFileId?: string;
    imageUrl?: string;
    attachments?: MessageAttachment[];
    replyToId?: string;
    mentions?: string[];
};

export type CreateConversationInput = {
    participants?: string[];
    name?: string;
    avatarUrl?: string;
    userId1?: string;
    userId2?: string;
};

export async function fetchDirectMessageConversations(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<DirectMessageConversationsResponse>({
        baseUrl,
        path: "/api/direct-messages",
        token,
        query: {
            type: "conversations",
        },
    });
}

export async function fetchDirectMessageConversationById(
    baseUrl: string,
    token: string,
    conversationId: string,
) {
    return firepitRequest<DirectMessageConversationResponse>({
        baseUrl,
        path: "/api/direct-messages",
        token,
        query: {
            type: "conversationById",
            conversationId,
        },
    });
}

export async function fetchDirectMessageMessages(
    baseUrl: string,
    token: string,
    conversationId: string,
    limit = 50,
    cursor?: string,
) {
    return firepitRequest<DirectMessageMessagesResponse>({
        baseUrl,
        path: "/api/direct-messages",
        token,
        query: {
            type: "messages",
            conversationId,
            limit,
            cursor,
        },
    });
}

export async function sendDirectMessage(
    baseUrl: string,
    token: string,
    input: SendDirectMessageInput,
) {
    return firepitRequest<{ message?: DirectMessage | null }>({
        baseUrl,
        path: "/api/direct-messages",
        method: "POST",
        token,
        body: input,
    });
}

export type PinsResponse = {
    items: Array<{
        pin: { messageId: string; pinnedBy: string; pinnedAt: string };
        message: DirectMessage;
    }>;
    pins: DirectMessage[];
    total: number;
};

export async function fetchConversationPins(
    baseUrl: string,
    token: string,
    conversationId: string,
): Promise<PinsResponse> {
    return firepitRequest<PinsResponse>({
        baseUrl,
        path: `/api/conversations/${encodeURIComponent(conversationId)}/pins`,
        token,
    });
}

export async function muteConversation(
    baseUrl: string,
    token: string,
    conversationId: string,
    muted: boolean,
    duration: "15m" | "1h" | "8h" | "24h" | "forever" = "forever",
) {
    return firepitRequest<{
        conversationId: string;
        muted: boolean;
        mutedUntil?: string;
        level: string;
    }>({
        baseUrl,
        path: `/api/conversations/${encodeURIComponent(conversationId)}/mute`,
        method: "POST",
        token,
        body: { muted, duration },
    });
}

export async function muteChannel(
    baseUrl: string,
    token: string,
    channelId: string,
    muted: boolean,
    duration: "15m" | "1h" | "8h" | "24h" | "forever" = "forever",
) {
    return firepitRequest<{
        channelId: string;
        muted: boolean;
        mutedUntil?: string;
        level: string;
    }>({
        baseUrl,
        path: `/api/channels/${encodeURIComponent(channelId)}/mute`,
        method: "POST",
        token,
        body: { muted, duration },
    });
}

export async function muteServer(
    baseUrl: string,
    token: string,
    serverId: string,
    muted: boolean,
    duration: "15m" | "1h" | "8h" | "24h" | "forever" = "forever",
) {
    return firepitRequest<{
        serverId: string;
        muted: boolean;
        mutedUntil?: string;
        level: string;
    }>({
        baseUrl,
        path: `/api/servers/${encodeURIComponent(serverId)}/mute`,
        method: "POST",
        token,
        body: { muted, duration },
    });
}

export async function pinDirectMessage(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/direct-messages/${encodeURIComponent(messageId)}/pin`,
        method: "POST",
        token,
    });
}

export async function unpinDirectMessage(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/direct-messages/${encodeURIComponent(messageId)}/pin`,
        method: "DELETE",
        token,
    });
}

export async function pinChannelMessage(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}/pin`,
        method: "POST",
        token,
    });
}

export async function unpinChannelMessage(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}/pin`,
        method: "DELETE",
        token,
    });
}

export async function createDirectMessageConversation(
    baseUrl: string,
    token: string,
    input: CreateConversationInput,
) {
    return firepitRequest<{ conversation?: DirectMessageConversation | null }>({
        baseUrl,
        path: "/api/direct-messages",
        method: "POST",
        token,
        body: {
            operation: "createConversation",
            ...input,
        },
    });
}

export async function createChannelMessage(
    baseUrl: string,
    token: string,
    input: CreateChannelMessageInput,
) {
    return firepitRequest<{ message?: Message | null }>({
        baseUrl,
        path: "/api/messages",
        method: "POST",
        token,
        body: input,
    });
}

export async function updateChannelMessage(
    baseUrl: string,
    token: string,
    messageId: string,
    text: string,
) {
    return firepitRequest<{ message?: Message | null }>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}`,
        method: "PATCH",
        token,
        body: { text },
    });
}

export async function deleteChannelMessage(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}`,
        method: "DELETE",
        token,
    });
}

export async function fetchChannelMessages(
    baseUrl: string,
    token: string,
    channelId: string,
    limit = 50,
    cursorAfter?: string,
) {
    return firepitRequest<MessageListResponse>({
        baseUrl,
        path: "/api/messages",
        token,
        query: {
            channelId,
            limit,
            cursorAfter,
        },
    });
}

export async function fetchChannelThreadMessages(
    baseUrl: string,
    token: string,
    messageId: string,
    limit = 50,
) {
    return firepitRequest<ThreadMessagesResponse>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}/thread`,
        token,
        query: { limit },
    });
}

export async function createChannelThreadReply(
    baseUrl: string,
    token: string,
    messageId: string,
    input: ThreadReplyInput,
) {
    return firepitRequest<{ message?: Message | null; reply?: Message | null }>({
        baseUrl,
        path: `/api/messages/${encodeURIComponent(messageId)}/thread`,
        method: "POST",
        token,
        body: input,
    });
}

export async function fetchDMThreadMessages(
    baseUrl: string,
    token: string,
    messageId: string,
) {
    return firepitRequest<ThreadMessagesResponse>({
        baseUrl,
        path: `/api/direct-messages/${encodeURIComponent(messageId)}/thread`,
        token,
    });
}

export async function createDMThreadReply(
    baseUrl: string,
    token: string,
    messageId: string,
    input: ThreadReplyInput,
) {
    return firepitRequest<{ message?: Message | null; reply?: Message | null }>({
        baseUrl,
        path: `/api/direct-messages/${encodeURIComponent(messageId)}/thread`,
        method: "POST",
        token,
        body: input,
    });
}

export async function searchMessages(
    baseUrl: string,
    token: string,
    query: string,
    filters?: {
        channel?: string;
        user?: string;
        from?: string;
        to?: string;
    },
) {
    return firepitRequest<SearchMessagesResponse>({
        baseUrl,
        path: "/api/search/messages",
        token,
        query: {
            q: query,
            channel: filters?.channel,
            user: filters?.user,
            from: filters?.from,
            to: filters?.to,
        },
    });
}

export async function listInboxDigest(
    baseUrl: string,
    token: string,
    params?: {
        contextId?: string;
        contextKind?: InboxContextKind;
        limit?: number;
    },
) {
    return firepitRequest<InboxDigestResponse>({
        baseUrl,
        path: "/api/inbox/digest",
        token,
        query: {
            contextId: params?.contextId,
            contextKind: params?.contextKind,
            limit: params?.limit,
        },
    });
}

export async function markInboxContextRead(
    baseUrl: string,
    token: string,
    params?: {
        contextId?: string;
        contextKind?: InboxContextKind;
    },
) {
    await firepitRequest<Record<string, unknown>>({
        baseUrl,
        path: "/api/inbox",
        method: "PATCH",
        token,
        body: {
            action: "mark-all-read",
            contextId: params?.contextId,
            contextKind: params?.contextKind,
        },
    });
}

export type TimelineMessage = Message & {
    local?: boolean;
    senderId?: string;
};

export async function fetchCustomEmojis(
    baseUrl: string,
    token: string,
): Promise<CustomEmoji[]> {
    const res = await firepitRequest<CustomEmoji[] | CustomEmojiListResponse>({
        baseUrl,
        path: "/api/custom-emojis",
        token,
    });
    return Array.isArray(res) ? res : (res.emojis ?? []);
}

export async function fetchRelationship(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ relationship?: RelationshipStatus }>({
        baseUrl,
        path: `/api/users/${encodeURIComponent(targetUserId)}/relationship`,
        token,
    });
}

export async function sendFriendRequest(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/friends/request",
        method: "POST",
        token,
        body: { targetUserId },
    });
}

export async function acceptFriendRequest(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/friends/${encodeURIComponent(targetUserId)}/accept`,
        method: "POST",
        token,
    });
}

export async function declineFriendRequest(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/friends/${encodeURIComponent(targetUserId)}/decline`,
        method: "POST",
        token,
    });
}

export async function removeFriendship(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/friends/${encodeURIComponent(targetUserId)}`,
        method: "DELETE",
        token,
    });
}

export async function blockUser(
    baseUrl: string,
    token: string,
    targetUserId: string,
    reason?: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/users/${encodeURIComponent(targetUserId)}/block`,
        method: "POST",
        token,
        body: reason ? { reason } : undefined,
    });
}

export async function unblockUser(
    baseUrl: string,
    token: string,
    targetUserId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/users/${encodeURIComponent(targetUserId)}/block`,
        method: "DELETE",
        token,
    });
}

export async function submitReport(
    baseUrl: string,
    token: string,
    targetUserId: string,
    justification: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await firepitRequest<{ success?: boolean }>({
            baseUrl,
            path: "/api/reports",
            method: "POST",
            token,
            body: { targetUserId, justification },
        });
        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to submit report",
        };
    }
}

export async function fetchFriendsList(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<FriendsResponse>({
        baseUrl,
        path: "/api/friends",
        token,
    });
}

export async function fetchBlockedUsers(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<BlockedUsersResponse>({
        baseUrl,
        path: "/api/users/blocked",
        token,
    });
}
