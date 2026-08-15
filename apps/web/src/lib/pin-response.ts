import { Query } from "node-appwrite";
import type { Databases } from "node-appwrite";

import type { EnvConfig } from "@/lib/appwrite-core";
import type { DirectMessage, Message, PinnedMessage } from "@/lib/types";

export type PinnableMessage = Message | DirectMessage;

export type PinItem<TMessage extends PinnableMessage> = {
    pin: PinnedMessage;
    message: TMessage;
};

export type PinsResponse<TMessage extends PinnableMessage> = {
    items: Array<PinItem<TMessage>>;
    pins: TMessage[];
    total: number;
};

export async function listPinnedMessages(options: {
    databases: Databases;
    env: EnvConfig;
    contextType: "channel" | "conversation";
    contextId: string;
    messageCollectionId: string;
}): Promise<{
    pins: PinnedMessage[];
    messagesById: Map<string, PinnableMessage>;
} | null> {
    const { databases, env, contextType, contextId, messageCollectionId } =
        options;

    const pinDocs = await databases.listDocuments(
        env.databaseId,
        env.collections.pinnedMessages,
        [
            Query.equal("contextType", contextType),
            Query.equal("contextId", contextId),
            Query.orderDesc("pinnedAt"),
            Query.limit(50),
        ],
    );

    const pins = pinDocs.documents as unknown as PinnedMessage[];
    const messageIds = pins.map((pin) => pin.messageId);

    if (messageIds.length === 0) {
        return null;
    }

    const messageDocs = await databases.listDocuments(
        env.databaseId,
        messageCollectionId,
        [Query.equal("$id", messageIds), Query.limit(messageIds.length)],
    );

    const messagesById = new Map<string, PinnableMessage>();
    for (const doc of messageDocs.documents) {
        const message = doc as unknown as PinnableMessage;
        messagesById.set(String(message.$id), message);
    }

    return { pins, messagesById };
}

export function buildPinsResponse<TMessage extends PinnableMessage>(
    pins: PinnedMessage[],
    messagesById: Map<string, TMessage>,
): PinsResponse<TMessage> {
    const items = pins
        .map((pin) => {
            const message = messagesById.get(pin.messageId);
            if (!message) {
                return null;
            }

            return {
                pin,
                message: {
                    ...message,
                    isPinned: true,
                    pinnedAt: pin.pinnedAt,
                    pinnedBy: pin.pinnedBy,
                },
            } satisfies PinItem<TMessage>;
        })
        .filter(Boolean) as Array<PinItem<TMessage>>;

    const pinnedMessages = items.map((item) => item.message);

    return {
        items,
        pins: pinnedMessages,
        total: pinnedMessages.length,
    };
}
