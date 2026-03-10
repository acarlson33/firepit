import { describe, expect, it } from "vitest";

import {
    adaptChannelMessages,
    adaptDirectMessages,
    fromChannelMessage,
    fromDirectMessage,
} from "@/lib/chat-surface";
import type { DirectMessage, Message } from "@/lib/types";

describe("chat-surface adapters", () => {
    it("normalizes equivalent channel and DM messages into the same UI shape", () => {
        const createdAt = "2026-03-10T12:00:00.000Z";
        const channelMessage: Message = {
            $id: "message-1",
            userId: "user-1",
            userName: "alice",
            displayName: "Alice",
            avatarUrl: "https://example.com/alice.png",
            pronouns: "she/her",
            text: "Hello world",
            $createdAt: createdAt,
            channelId: "channel-1",
            serverId: "server-1",
            editedAt: "2026-03-10T12:01:00.000Z",
            imageFileId: "image-1",
            imageUrl: "https://example.com/image.png",
            attachments: [
                {
                    fileId: "file-1",
                    fileName: "notes.txt",
                    fileSize: 128,
                    fileType: "text/plain",
                    fileUrl: "https://example.com/notes.txt",
                },
            ],
            replyToId: "parent-1",
            replyTo: {
                text: "Parent message",
                displayName: "Bob",
            },
            threadMessageCount: 2,
            threadParticipants: ["user-1", "user-2"],
            lastThreadReplyAt: "2026-03-10T12:02:00.000Z",
            mentions: ["user-3"],
            reactions: [{ emoji: ":wave:", userIds: ["user-2"], count: 1 }],
            isPinned: true,
            pinnedAt: "2026-03-10T12:03:00.000Z",
            pinnedBy: "user-9",
        };

        const directMessage: DirectMessage = {
            $id: "message-1",
            conversationId: "conversation-1",
            senderId: "user-1",
            text: "Hello world",
            $createdAt: createdAt,
            editedAt: "2026-03-10T12:01:00.000Z",
            imageFileId: "image-1",
            imageUrl: "https://example.com/image.png",
            attachments: [
                {
                    fileId: "file-1",
                    fileName: "notes.txt",
                    fileSize: 128,
                    fileType: "text/plain",
                    fileUrl: "https://example.com/notes.txt",
                },
            ],
            replyToId: "parent-1",
            replyTo: {
                text: "Parent message",
                senderDisplayName: "Bob",
            },
            threadMessageCount: 2,
            threadParticipants: ["user-1", "user-2"],
            lastThreadReplyAt: "2026-03-10T12:02:00.000Z",
            mentions: ["user-3"],
            reactions: [{ emoji: ":wave:", userIds: ["user-2"], count: 1 }],
            senderDisplayName: "Alice",
            senderAvatarUrl: "https://example.com/alice.png",
            senderPronouns: "she/her",
        };

        const normalizedChannel = fromChannelMessage(channelMessage);
        const normalizedDm = fromDirectMessage(directMessage, {
            kind: "dm",
            conversationId: "conversation-1",
            isGroup: false,
            readOnly: false,
            readOnlyReason: null,
        });

        expect(normalizedChannel.authorId).toBe(normalizedDm.authorId);
        expect(normalizedChannel.authorLabel).toBe(normalizedDm.authorLabel);
        expect(normalizedChannel.authorAvatarUrl).toBe(
            normalizedDm.authorAvatarUrl,
        );
        expect(normalizedChannel.authorPronouns).toBe(
            normalizedDm.authorPronouns,
        );
        expect(normalizedChannel.text).toBe(normalizedDm.text);
        expect(normalizedChannel.createdAt).toBe(normalizedDm.createdAt);
        expect(normalizedChannel.imageUrl).toBe(normalizedDm.imageUrl);
        expect(normalizedChannel.attachments).toEqual(normalizedDm.attachments);
        expect(normalizedChannel.replyTo).toEqual(normalizedDm.replyTo);
        expect(normalizedChannel.threadReplyCount).toBe(
            normalizedDm.threadReplyCount,
        );
        expect(normalizedChannel.threadParticipants).toEqual(
            normalizedDm.threadParticipants,
        );
        expect(normalizedChannel.mentions).toEqual(normalizedDm.mentions);
        expect(normalizedChannel.reactions).toEqual(normalizedDm.reactions);
        expect(normalizedChannel.isPinned).toBe(true);
        expect(normalizedDm.isPinned).toBe(false);
    });

    it("preserves context-specific metadata in the normalized message", () => {
        const channelMessage: Message = {
            $id: "channel-message",
            userId: "user-1",
            text: "Hello from channel",
            $createdAt: "2026-03-10T12:00:00.000Z",
            channelId: "channel-9",
            serverId: "server-3",
        };
        const dmMessage: DirectMessage = {
            $id: "dm-message",
            conversationId: "conversation-9",
            senderId: "user-2",
            text: "Hello from dm",
            $createdAt: "2026-03-10T12:00:00.000Z",
        };

        expect(fromChannelMessage(channelMessage).context).toEqual({
            kind: "channel",
            channelId: "channel-9",
            serverId: "server-3",
        });
        expect(fromDirectMessage(dmMessage).context).toEqual({
            kind: "dm",
            conversationId: "conversation-9",
            isGroup: undefined,
            readOnly: undefined,
            readOnlyReason: undefined,
        });
    });

    it("sorts adapted messages by createdAt and id", () => {
        const channelMessages: Message[] = [
            {
                $id: "b",
                userId: "user-1",
                text: "Second by id",
                $createdAt: "2026-03-10T12:00:00.000Z",
                channelId: "channel-1",
            },
            {
                $id: "a",
                userId: "user-1",
                text: "First by id",
                $createdAt: "2026-03-10T12:00:00.000Z",
                channelId: "channel-1",
            },
            {
                $id: "c",
                userId: "user-1",
                text: "Newest",
                $createdAt: "2026-03-10T12:01:00.000Z",
                channelId: "channel-1",
            },
        ];
        const dmMessages: DirectMessage[] = [
            {
                $id: "2",
                conversationId: "conversation-1",
                senderId: "user-1",
                text: "Newest",
                $createdAt: "2026-03-10T12:01:00.000Z",
            },
            {
                $id: "1",
                conversationId: "conversation-1",
                senderId: "user-1",
                text: "Oldest",
                $createdAt: "2026-03-10T12:00:00.000Z",
            },
        ];

        expect(
            adaptChannelMessages(channelMessages).map((message) => message.id),
        ).toEqual(["a", "b", "c"]);
        expect(
            adaptDirectMessages(dmMessages).map((message) => message.id),
        ).toEqual(["1", "2"]);
    });

    it("does not leak mutable array references from source messages", () => {
        const channelMessage: Message = {
            $id: "message-1",
            userId: "user-1",
            text: "Hello",
            $createdAt: "2026-03-10T12:00:00.000Z",
            channelId: "channel-1",
            mentions: ["user-2"],
            threadParticipants: ["user-1"],
            reactions: [{ emoji: ":wave:", userIds: ["user-2"], count: 1 }],
        };

        const normalized = fromChannelMessage(channelMessage);

        normalized.mentions?.push("user-3");
        normalized.threadParticipants?.push("user-4");
        normalized.reactions?.[0]?.userIds.push("user-5");

        expect(channelMessage.mentions).toEqual(["user-2"]);
        expect(channelMessage.threadParticipants).toEqual(["user-1"]);
        expect(channelMessage.reactions?.[0]?.userIds).toEqual(["user-2"]);
    });

    it("tolerates malformed legacy reaction payloads", () => {
        const legacyMessage = {
            $id: "legacy-message",
            userId: "user-1",
            text: "Hello",
            $createdAt: "2026-03-10T12:00:00.000Z",
            channelId: "channel-1",
            reactions: {} as Message["reactions"],
        } satisfies Omit<Message, "reactions"> & {
            reactions: Message["reactions"];
        };

        expect(fromChannelMessage(legacyMessage).reactions).toBeUndefined();
    });
});
