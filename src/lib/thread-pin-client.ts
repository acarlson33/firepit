import type { DirectMessage, Message, PinnedMessage } from "@/lib/types";

import type {
    PinItem,
    PinnableMessage,
    PinsResponse,
} from "@/lib/pin-response";

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

/**
 * Lists replies for a channel thread parent message.
 *
 * @param {string} messageId - Parent channel message id that anchors the thread.
 * @param {number} limit - Maximum number of replies to request; defaults to 50 when omitted.
 * @returns {Promise<Message[]>} Resolves to channel thread replies in API return order.
 */
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

/**
 * Creates a new reply in a channel thread.
 *
 * @param {string} messageId - Parent channel message id for the target thread.
 * @param {ThreadReplyPayload} payload - Reply payload (text, mentions, and optional media metadata).
 * @returns {Promise<Message>} Resolves to the created channel reply.
 */
export async function createChannelThreadReply(
    messageId: string,
    payload: ThreadReplyPayload,
): Promise<Message> {
    return createThreadReply<Message>("channel", messageId, payload);
}

/**
 * Lists replies for a DM thread parent message.
 *
 * @param {string} messageId - Parent DM message id that anchors the thread.
 * @param {number} limit - Maximum number of replies to request; defaults to 50 when omitted.
 * @returns {Promise<DirectMessage[]>} Resolves to DM thread replies in API return order.
 */
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

/**
 * Creates a new reply in a DM thread.
 *
 * @param {string} messageId - Parent DM message id for the target thread.
 * @param {ThreadReplyPayload} payload - Reply payload (text, mentions, and optional media metadata).
 * @returns {Promise<DirectMessage>} Resolves to the created DM reply.
 */
export async function createDMThreadReply(
    messageId: string,
    payload: ThreadReplyPayload,
): Promise<DirectMessage> {
    return createThreadReply<DirectMessage>("dm", messageId, payload);
}

/**
 * Pins a channel message.
 *
 * @param {string} messageId - Channel message id to pin.
 * @returns {Promise<PinnedMessage>} Resolves to the created pin record.
 */
export async function pinChannelMessage(
    messageId: string,
): Promise<PinnedMessage> {
    return pinMessage("channel", messageId);
}

/**
 * Removes a pin from a channel message.
 *
 * @param {string} messageId - Channel message id to unpin.
 * @returns {Promise<void>} Resolves when the pin has been removed.
 */
export async function unpinChannelMessage(messageId: string): Promise<void> {
    await unpinMessage("channel", messageId);
}

/**
 * Lists pinned messages for a channel.
 *
 * @param {string} channelId - Channel identifier whose pins should be fetched.
 * @returns {Promise<PinItem<Message>[]>} Resolves to channel pin items.
 */
export async function listChannelPins(
    channelId: string,
): Promise<Array<PinItem<Message>>> {
    return listPins<Message>("channel", channelId);
}

/**
 * Pins a DM message.
 *
 * @param {string} messageId - DM message id to pin.
 * @returns {Promise<PinnedMessage>} Resolves to the created pin record.
 */
export async function pinDMMessage(messageId: string): Promise<PinnedMessage> {
    return pinMessage("dm", messageId);
}

/**
 * Removes a pin from a DM message.
 *
 * @param {string} messageId - DM message id to unpin.
 * @returns {Promise<void>} Resolves when the pin has been removed.
 */
export async function unpinDMMessage(messageId: string): Promise<void> {
    await unpinMessage("dm", messageId);
}

/**
 * Lists pinned messages for a DM conversation.
 *
 * @param {string} conversationId - Conversation identifier whose pins should be fetched.
 * @returns {Promise<PinItem<DirectMessage>[]>} Resolves to conversation pin items.
 */
export async function listConversationPins(
    conversationId: string,
): Promise<Array<PinItem<DirectMessage>>> {
    return listPins<DirectMessage>("dm", conversationId);
}

/**
 * Pins a message on the selected surface (channel or DM).
 *
 * @param {'channel' | 'dm'} surface - Message surface namespace used to route the API request.
 * @param {string} messageId - Message identifier to pin.
 * @returns {Promise<PinnedMessage>} Resolves to the created pin payload.
 */
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

/**
 * Unpins a message on the selected surface (channel or DM).
 *
 * @param {'channel' | 'dm'} surface - Message surface namespace used to route the API request.
 * @param {string} messageId - Message identifier to unpin.
 * @returns {Promise<void>} Resolves when the unpin request succeeds.
 */
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

export async function listPins<TMessage extends PinnableMessage>(
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
