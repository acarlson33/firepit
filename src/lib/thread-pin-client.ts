import type { DirectMessage, Message, PinnedMessage } from "@/lib/types";

import type { PinItem, PinsResponse } from "@/lib/pin-response";

type ThreadResponse<TMessage> = {
    items?: TMessage[];
    replies?: TMessage[];
};

type CreateThreadReplyResponse<TMessage> = {
    message?: TMessage;
    reply?: TMessage;
};

export type ThreadPinSurface = "channel" | "dm";

export type ThreadReplyPayload = {
    text?: string;
    imageFileId?: string;
    imageUrl?: string;
    mentions?: string[];
    attachments?: unknown[];
};

const messageSurfaceConfig = {
    channel: {
        createThreadError: "Failed to create channel thread reply",
        listThreadError: "Failed to fetch channel thread",
        messageBasePath: "/api/messages",
        pinError: "Failed to pin channel message",
        unpinError: "Failed to unpin channel message",
    },
    dm: {
        createThreadError: "Failed to create DM thread reply",
        listThreadError: "Failed to fetch DM thread",
        messageBasePath: "/api/direct-messages",
        pinError: "Failed to pin DM message",
        unpinError: "Failed to unpin DM message",
    },
} as const;

const pinsSurfaceConfig = {
    channel: {
        contextBasePath: "/api/channels",
        listPinsError: "Failed to fetch channel pins",
    },
    dm: {
        contextBasePath: "/api/conversations",
        listPinsError: "Failed to fetch conversation pins",
    },
} as const;

async function parseJsonResponse<T>(
    response: Response,
    fallbackMessage: string,
): Promise<T> {
    if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
            error?: string;
        } | null;
        throw new Error(data?.error || fallbackMessage);
    }

    return response.json() as Promise<T>;
}

export async function listChannelThreadMessages(
    messageId: string,
    limit = 50,
): Promise<Message[]> {
    return listThreadMessages<Message>("channel", messageId, limit);
}

export async function listThreadMessages<TMessage>(
    surface: ThreadPinSurface,
    messageId: string,
    limit = 50,
): Promise<TMessage[]> {
    const config = messageSurfaceConfig[surface];
    const response = await fetch(
        `${config.messageBasePath}/${encodeURIComponent(messageId)}/thread?limit=${limit}`,
    );
    const data = await parseJsonResponse<ThreadResponse<TMessage>>(
        response,
        config.listThreadError,
    );
    return data.items ?? data.replies ?? [];
}

export async function createChannelThreadReply(
    messageId: string,
    payload: ThreadReplyPayload,
): Promise<Message> {
    return createThreadReply<Message>("channel", messageId, payload);
}

export async function listDMThreadMessages(
    messageId: string,
    limit = 50,
): Promise<DirectMessage[]> {
    return listThreadMessages<DirectMessage>("dm", messageId, limit);
}

export async function createThreadReply<TMessage>(
    surface: ThreadPinSurface,
    messageId: string,
    payload: ThreadReplyPayload,
): Promise<TMessage> {
    const config = messageSurfaceConfig[surface];
    const response = await fetch(
        `${config.messageBasePath}/${encodeURIComponent(messageId)}/thread`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );
    const data = await parseJsonResponse<{ message: TMessage }>(
        response,
        config.createThreadError,
    );
    const message =
        (data as CreateThreadReplyResponse<TMessage>).message ??
        (data as CreateThreadReplyResponse<TMessage>).reply;

    if (!message) {
        throw new Error(config.createThreadError);
    }

    return message;
}

export async function createDMThreadReply(
    messageId: string,
    payload: ThreadReplyPayload,
): Promise<DirectMessage> {
    return createThreadReply<DirectMessage>("dm", messageId, payload);
}

export async function pinChannelMessage(
    messageId: string,
): Promise<PinnedMessage> {
    return pinMessage("channel", messageId);
}

export async function unpinChannelMessage(messageId: string): Promise<void> {
    await unpinMessage("channel", messageId);
}

export async function listChannelPins(
    channelId: string,
): Promise<Array<PinItem<Message>>> {
    return listPins<Message>("channel", channelId);
}

export async function pinDMMessage(messageId: string): Promise<PinnedMessage> {
    return pinMessage("dm", messageId);
}

export async function unpinDMMessage(messageId: string): Promise<void> {
    await unpinMessage("dm", messageId);
}

export async function listConversationPins(
    conversationId: string,
): Promise<Array<PinItem<DirectMessage>>> {
    return listPins<DirectMessage>("dm", conversationId);
}

export async function pinMessage(
    surface: ThreadPinSurface,
    messageId: string,
): Promise<PinnedMessage> {
    const config = messageSurfaceConfig[surface];
    const response = await fetch(
        `${config.messageBasePath}/${encodeURIComponent(messageId)}/pin`,
        {
            method: "POST",
        },
    );
    const data = await parseJsonResponse<{ pin: PinnedMessage }>(
        response,
        config.pinError,
    );
    return data.pin;
}

export async function unpinMessage(
    surface: ThreadPinSurface,
    messageId: string,
): Promise<void> {
    const config = messageSurfaceConfig[surface];
    const response = await fetch(
        `${config.messageBasePath}/${encodeURIComponent(messageId)}/pin`,
        {
            method: "DELETE",
        },
    );
    await parseJsonResponse<{ success: boolean }>(response, config.unpinError);
}

export async function listPins<TMessage>(
    surface: ThreadPinSurface,
    contextId: string,
): Promise<Array<PinItem<TMessage>>> {
    const config = pinsSurfaceConfig[surface];
    const response = await fetch(
        `${config.contextBasePath}/${encodeURIComponent(contextId)}/pins`,
    );
    const data = await parseJsonResponse<PinsResponse<TMessage>>(
        response,
        config.listPinsError,
    );
    return data.items;
}
