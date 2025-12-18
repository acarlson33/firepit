"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { ReactionButton } from "@/components/reaction-button";
import { formatMessageTimestamp } from "@/lib/utils";
import { Send, Loader2, MessageSquareMore } from "lucide-react";
import type { Message, CustomEmoji } from "@/lib/types";

type ThreadPanelProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	parentMessage: Message | null;
	userId: string | null;
	customEmojis?: CustomEmoji[];
	onToggleReaction?: (
		messageId: string,
		emoji: string,
		isAdding: boolean
	) => Promise<void>;
};

type ThreadReply = Message;

export function ThreadPanel({
	open,
	onOpenChange,
	parentMessage,
	userId,
	customEmojis,
	onToggleReaction,
}: ThreadPanelProps) {
	const [replies, setReplies] = useState<ThreadReply[]>([]);
	const [loading, setLoading] = useState(false);
	const [sending, setSending] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Fetch thread replies when panel opens
	const fetchThread = useCallback(async () => {
		if (!parentMessage) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const res = await fetch(
				`/api/messages/${parentMessage.$id}/thread`
			);
			if (!res.ok) {
				throw new Error("Failed to fetch thread");
			}
			const data = await res.json();
			setReplies(data.replies || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load thread");
		} finally {
			setLoading(false);
		}
	}, [parentMessage]);

	useEffect(() => {
		if (open && parentMessage) {
			void fetchThread();
		}
	}, [open, parentMessage, fetchThread]);

	// Send a reply to the thread
	const handleSendReply = async () => {
		if (!replyText.trim() || !parentMessage || sending) {
			return;
		}

		setSending(true);
		setError(null);

		try {
			const res = await fetch(
				`/api/messages/${parentMessage.$id}/thread`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text: replyText.trim() }),
				}
			);

			if (!res.ok) {
				throw new Error("Failed to send reply");
			}

			const data = await res.json();
			setReplies((prev) => [...prev, data.reply]);
			setReplyText("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send reply");
		} finally {
			setSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSendReply();
		}
	};

	if (!parentMessage) {
		return null;
	}

	const displayName =
		parentMessage.displayName ||
		parentMessage.userName ||
		parentMessage.userId.slice(0, 8);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col sm:max-w-lg" side="right">
				<SheetHeader className="border-b pb-4">
					<SheetTitle className="flex items-center gap-2">
						<MessageSquareMore className="h-5 w-5" />
						Thread
					</SheetTitle>
				</SheetHeader>

				{/* Parent Message */}
				<div className="border-b pb-4">
					<div className="flex gap-3">
						<Avatar
							alt={displayName}
							fallback={displayName}
							size="md"
							src={parentMessage.avatarUrl}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2 text-xs text-muted-foreground">
								<span className="font-medium text-foreground">
									{displayName}
								</span>
								<span>
									{formatMessageTimestamp(parentMessage.$createdAt)}
								</span>
							</div>
							<div className="mt-1 text-sm">
								<MessageWithMentions text={parentMessage.text} />
							</div>
							{parentMessage.imageUrl && (
								<img
									alt="Attached"
									className="mt-2 max-h-32 rounded-lg border"
									src={parentMessage.imageUrl}
								/>
							)}
							{parentMessage.attachments &&
								parentMessage.attachments.length > 0 && (
									<div className="mt-2 space-y-1">
										{parentMessage.attachments.map((att, idx) => (
											<FileAttachmentDisplay
												key={`${parentMessage.$id}-${att.fileId}-${idx}`}
												attachment={att}
											/>
										))}
									</div>
								)}
						</div>
					</div>
					<div className="mt-2 text-xs text-muted-foreground">
						{replies.length} {replies.length === 1 ? "reply" : "replies"}
					</div>
				</div>

				{/* Thread Replies */}
				<div className="flex-1 overflow-y-auto py-4">
					{loading && (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					)}

					{error && (
						<div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					{!loading && replies.length === 0 && (
						<div className="py-8 text-center text-sm text-muted-foreground">
							No replies yet. Be the first to reply!
						</div>
					)}

					<div className="space-y-4">
						{replies.map((reply) => {
							const replyDisplayName =
								reply.displayName ||
								reply.userName ||
								reply.userId.slice(0, 8);

							return (
								<div
									key={reply.$id}
									className="flex gap-3 rounded-lg border border-transparent p-2 transition hover:border-border/50"
								>
									<Avatar
										alt={replyDisplayName}
										fallback={replyDisplayName}
										size="sm"
										src={reply.avatarUrl}
									/>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline gap-2 text-xs text-muted-foreground">
											<span className="font-medium text-foreground">
												{replyDisplayName}
											</span>
											<span>
												{formatMessageTimestamp(reply.$createdAt)}
											</span>
										</div>
										<div className="mt-1 text-sm">
											<MessageWithMentions text={reply.text} />
										</div>
										{reply.imageUrl && (
											<img
												alt="Attached"
												className="mt-2 max-h-24 rounded-lg border"
												src={reply.imageUrl}
											/>
										)}
										{reply.attachments &&
											reply.attachments.length > 0 && (
												<div className="mt-2 space-y-1">
													{reply.attachments.map((att, idx) => (
														<FileAttachmentDisplay
															key={`${reply.$id}-${att.fileId}-${idx}`}
															attachment={att}
														/>
													))}
												</div>
											)}
										{reply.reactions &&
											reply.reactions.length > 0 &&
											onToggleReaction && (
												<div className="mt-2 flex flex-wrap gap-1">
													{reply.reactions.map((reaction) => (
														<ReactionButton
															currentUserId={userId}
															customEmojis={customEmojis}
															key={`${reply.$id}-${reaction.emoji}`}
															onToggle={(e, isAdding) =>
																onToggleReaction(reply.$id, e, isAdding)
															}
															reaction={reaction}
														/>
													))}
												</div>
											)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="border-t pt-4">
					<div className="flex gap-2">
						<Textarea
							className="min-h-20 resize-none"
							disabled={sending}
							onChange={(e) => setReplyText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Reply to thread..."
							value={replyText}
						/>
						<Button
							className="shrink-0"
							disabled={!replyText.trim() || sending}
							onClick={() => void handleSendReply()}
							size="icon"
							type="button"
						>
							{sending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4" />
							)}
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
