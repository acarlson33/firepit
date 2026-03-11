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
