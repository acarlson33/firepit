"use client";

import { useMemo } from "react";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import type { DirectMessage, Message } from "@/lib/types";

type VirtualizedDMListProps = {
	messages: DirectMessage[];
	userId: string | null;
	userIdSlice: number;
	editingMessageId: string | null;
	deleteConfirmId: string | null;
	setDeleteConfirmId: (id: string | null) => void;
	onStartEdit: (message: Message) => void;
	onStartReply: (message: Message) => void;
	onRemove: (id: string) => void;
	onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
	onOpenProfileModal: (
		userId: string,
		userName?: string,
		displayName?: string,
		avatarUrl?: string,
	) => void;
	onOpenImageViewer: (imageUrl: string) => void;
	onOpenReactionPicker: (messageId: string) => void;
	shouldShowLoadOlder: boolean;
	onLoadOlder: () => void;
	conversationId: string;
};

/**
 * Adapter component that converts DirectMessage[] to Message[] format
 * for use with VirtualizedMessageList
 *
 * This bridges the type incompatibility between DirectMessage (DM-specific)
 * and Message (channel-specific) to enable virtual scrolling in DMs.
 *
 * Key mappings:
 * - senderId → userId
 * - conversationId → channelId
 * - senderDisplayName → userName/displayName
 */
export function VirtualizedDMList({
	messages,
	userId,
	userIdSlice,
	editingMessageId,
	deleteConfirmId,
	setDeleteConfirmId,
	onStartEdit,
	onStartReply,
	onRemove,
	onToggleReaction,
	onOpenProfileModal,
	onOpenImageViewer,
	onOpenReactionPicker,
	shouldShowLoadOlder,
	onLoadOlder,
	conversationId,
}: VirtualizedDMListProps) {
	// Convert DirectMessage[] to Message[] format
	const adaptedMessages = useMemo<Message[]>(() => {
		return messages.map((dm) => ({
			$id: dm.$id,
			// Map senderId to userId (VirtualizedMessageList expects userId)
			userId: dm.senderId,
			userName: dm.senderDisplayName || dm.senderId,
			text: dm.text,
			$createdAt: dm.$createdAt,
			// Use conversationId as channelId for compatibility
			channelId: conversationId,
			// No serverId for DMs
			serverId: undefined,
			editedAt: dm.editedAt,
			removedAt: dm.removedAt,
			removedBy: dm.removedBy,
			imageFileId: dm.imageFileId,
			imageUrl: dm.imageUrl,
			attachments: dm.attachments,
			replyToId: dm.replyToId,
			mentions: dm.mentions,
			reactions: dm.reactions,
			// Map enriched profile data
			displayName: dm.senderDisplayName,
			pronouns: dm.senderPronouns,
			avatarUrl: dm.senderAvatarUrl,
			// Map reply context
			replyTo: dm.replyTo
				? {
						text: dm.replyTo.text,
						userName: dm.replyTo.senderDisplayName,
						displayName: dm.replyTo.senderDisplayName,
					}
				: undefined,
		}));
	}, [messages, conversationId]);

	return (
		<VirtualizedMessageList
			messages={adaptedMessages}
			userId={userId}
			userIdSlice={userIdSlice}
			editingMessageId={editingMessageId}
			deleteConfirmId={deleteConfirmId}
			setDeleteConfirmId={setDeleteConfirmId}
			onStartEdit={onStartEdit}
			onStartReply={onStartReply}
			onRemove={onRemove}
			onToggleReaction={onToggleReaction}
			onOpenProfileModal={onOpenProfileModal}
			onOpenImageViewer={onOpenImageViewer}
			onOpenReactionPicker={onOpenReactionPicker}
			shouldShowLoadOlder={shouldShowLoadOlder}
			onLoadOlder={onLoadOlder}
		/>
	);
}
