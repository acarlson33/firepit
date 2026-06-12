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
    UserProfile,
    SearchMessagesResponse,
    ThreadMessagesResponse,
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

export async function fetchDirectMessageConversation(
    baseUrl: string,
    token: string,
    userId1: string,
    userId2: string,
) {
    return firepitRequest<DirectMessageConversationResponse>({
        baseUrl,
        path: "/api/direct-messages",
        token,
        query: {
            type: "conversation",
            userId1,
            userId2,
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

export async function fetchUserProfile(
    baseUrl: string,
    token: string,
    userId: string,
) {
    return firepitRequest<UserProfile>({
        baseUrl,
        path: `/api/users/${encodeURIComponent(userId)}/profile`,
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

export async function fetchChannelMessages(
    baseUrl: string,
    token: string,
    channelId: string,
    limit = 50,
) {
    return firepitRequest<MessageListResponse>({
        baseUrl,
        path: "/api/messages",
        token,
        query: {
            channelId,
            limit,
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

export async function listThreadReads(
    baseUrl: string,
    token: string,
    contextId: string,
    contextKind: InboxContextKind,
) {
    return firepitRequest<{ reads?: Record<string, string> }>({
        baseUrl,
        path: "/api/thread-reads",
        token,
        query: {
            contextId,
            contextKind,
        },
    });
}

export async function persistThreadReads(
    baseUrl: string,
    token: string,
    params: {
        contextId: string;
        contextKind: InboxContextKind;
        reads: Record<string, string>;
    },
) {
    return firepitRequest<{ reads?: Record<string, string> }>({
        baseUrl,
        path: "/api/thread-reads",
        method: "PATCH",
        token,
        body: {
            ...params,
            contextKind: params.contextKind,
        },
    });
}

export type TimelineMessage = Message & {
    local?: boolean;
};
