import type { DirectMessage, Message, PinnedMessage } from "@/lib/types";

type PinItem<TMessage> = {
    pin: PinnedMessage;
    message: TMessage;
};

type ThreadResponse<TMessage> = {
    items: TMessage[];
};

type PinsResponse<TMessage> = {
    items: Array<PinItem<TMessage>>;
};

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
    const response = await fetch(
        `/api/messages/${encodeURIComponent(messageId)}/thread?limit=${limit}`,
    );
    const data = await parseJsonResponse<ThreadResponse<Message>>(
        response,
        "Failed to fetch channel thread",
    );
    return data.items;
}

export async function createChannelThreadReply(
    messageId: string,
    payload: {
        text?: string;
        imageFileId?: string;
        imageUrl?: string;
        mentions?: string[];
        attachments?: unknown[];
    },
): Promise<Message> {
    const response = await fetch(
        `/api/messages/${encodeURIComponent(messageId)}/thread`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );
    const data = await parseJsonResponse<{ message: Message }>(
        response,
        "Failed to create channel thread reply",
    );
    return data.message;
}

export async function listDMThreadMessages(
    messageId: string,
    limit = 50,
): Promise<DirectMessage[]> {
    const response = await fetch(
        `/api/direct-messages/${encodeURIComponent(messageId)}/thread?limit=${limit}`,
    );
    const data = await parseJsonResponse<ThreadResponse<DirectMessage>>(
        response,
        "Failed to fetch DM thread",
    );
    return data.items;
}

export async function createDMThreadReply(
    messageId: string,
    payload: {
        text?: string;
        imageFileId?: string;
        imageUrl?: string;
        mentions?: string[];
        attachments?: unknown[];
    },
): Promise<DirectMessage> {
    const response = await fetch(
        `/api/direct-messages/${encodeURIComponent(messageId)}/thread`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );
    const data = await parseJsonResponse<{ message: DirectMessage }>(
        response,
        "Failed to create DM thread reply",
    );
    return data.message;
}

export async function pinChannelMessage(
    messageId: string,
): Promise<PinnedMessage> {
    const response = await fetch(
        `/api/messages/${encodeURIComponent(messageId)}/pin`,
        {
            method: "POST",
        },
    );
    const data = await parseJsonResponse<{ pin: PinnedMessage }>(
        response,
        "Failed to pin channel message",
    );
    return data.pin;
}

export async function unpinChannelMessage(messageId: string): Promise<void> {
    const response = await fetch(
        `/api/messages/${encodeURIComponent(messageId)}/pin`,
        {
            method: "DELETE",
        },
    );
    await parseJsonResponse<{ success: boolean }>(
        response,
        "Failed to unpin channel message",
    );
}

export async function listChannelPins(
    channelId: string,
): Promise<Array<PinItem<Message>>> {
    const response = await fetch(
        `/api/channels/${encodeURIComponent(channelId)}/pins`,
    );
    const data = await parseJsonResponse<PinsResponse<Message>>(
        response,
        "Failed to fetch channel pins",
    );
    return data.items;
}

export async function pinDMMessage(messageId: string): Promise<PinnedMessage> {
    const response = await fetch(
        `/api/direct-messages/${encodeURIComponent(messageId)}/pin`,
        {
            method: "POST",
        },
    );
    const data = await parseJsonResponse<{ pin: PinnedMessage }>(
        response,
        "Failed to pin DM message",
    );
    return data.pin;
}

export async function unpinDMMessage(messageId: string): Promise<void> {
    const response = await fetch(
        `/api/direct-messages/${encodeURIComponent(messageId)}/pin`,
        {
            method: "DELETE",
        },
    );
    await parseJsonResponse<{ success: boolean }>(
        response,
        "Failed to unpin DM message",
    );
}

export async function listConversationPins(
    conversationId: string,
): Promise<Array<PinItem<DirectMessage>>> {
    const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/pins`,
    );
    const data = await parseJsonResponse<PinsResponse<DirectMessage>>(
        response,
        "Failed to fetch conversation pins",
    );
    return data.items;
}
