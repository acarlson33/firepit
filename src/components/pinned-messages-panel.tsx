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
import { MessageWithMentions } from "@/components/message-with-mentions";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { formatMessageTimestamp } from "@/lib/utils";
import { Pin, Loader2, X } from "lucide-react";
import type { Message } from "@/lib/types";

type PinnedMessagesPanelProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	channelId: string | null;
	channelName?: string;
	onJumpToMessage?: (messageId: string) => void;
	onUnpin?: (messageId: string) => Promise<void>;
	canManageMessages?: boolean;
};

export function PinnedMessagesPanel({
	open,
	onOpenChange,
	channelId,
	channelName,
	onJumpToMessage,
	onUnpin,
	canManageMessages = false,
}: PinnedMessagesPanelProps) {
	const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [unpinningId, setUnpinningId] = useState<string | null>(null);

	// Fetch pinned messages when panel opens
	const fetchPins = useCallback(async () => {
		if (!channelId) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const res = await fetch(`/api/channels/${channelId}/pins`);
			if (!res.ok) {
				throw new Error("Failed to fetch pinned messages");
			}
			const data = await res.json();
			setPinnedMessages(data.pins || []);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load pinned messages"
			);
		} finally {
			setLoading(false);
		}
	}, [channelId]);

	useEffect(() => {
		if (open && channelId) {
			void fetchPins();
		}
	}, [open, channelId, fetchPins]);

	const handleUnpin = async (messageId: string) => {
		if (!onUnpin || unpinningId) {
			return;
		}

		setUnpinningId(messageId);
		try {
			await onUnpin(messageId);
			setPinnedMessages((prev) => prev.filter((m) => m.$id !== messageId));
		} catch {
			// Error handling in parent
		} finally {
			setUnpinningId(null);
		}
	};

	const handleJump = (messageId: string) => {
		if (onJumpToMessage) {
			onJumpToMessage(messageId);
			onOpenChange(false);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col sm:max-w-lg" side="right">
				<SheetHeader className="border-b pb-4">
					<SheetTitle className="flex items-center gap-2">
						<Pin className="h-5 w-5" />
						Pinned Messages
						{channelName && (
							<span className="text-sm font-normal text-muted-foreground">
								in #{channelName}
							</span>
						)}
					</SheetTitle>
				</SheetHeader>

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

					{!loading && pinnedMessages.length === 0 && (
						<div className="py-8 text-center text-sm text-muted-foreground">
							<Pin className="mx-auto mb-2 h-8 w-8 opacity-50" />
							<p>No pinned messages</p>
							<p className="mt-1 text-xs">
								Pin important messages to make them easy to find
							</p>
						</div>
					)}

					<div className="space-y-3">
						{pinnedMessages.map((message) => {
							const displayName =
								message.displayName ||
								message.userName ||
								message.userId.slice(0, 8);
							const isUnpinning = unpinningId === message.$id;

							return (
								<div
									key={message.$id}
									className="group relative rounded-lg border bg-card p-3 transition hover:border-primary/30"
								>
									{/* Unpin button */}
									{canManageMessages && onUnpin && (
										<Button
											className="absolute right-2 top-2 h-6 w-6 opacity-0 transition group-hover:opacity-100"
											disabled={isUnpinning}
											onClick={() => void handleUnpin(message.$id)}
											size="icon"
											title="Unpin message"
											type="button"
											variant="ghost"
										>
											{isUnpinning ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<X className="h-3 w-3" />
											)}
										</Button>
									)}

									<div className="flex gap-3">
										<Avatar
											alt={displayName}
											fallback={displayName}
											size="sm"
											src={message.avatarUrl}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline gap-2 text-xs text-muted-foreground">
												<span className="font-medium text-foreground">
													{displayName}
												</span>
												<span>
													{formatMessageTimestamp(message.$createdAt)}
												</span>
											</div>
											<div className="mt-1 text-sm">
												<MessageWithMentions text={message.text} />
											</div>
											{message.imageUrl && (
												<img
													alt="Attached"
													className="mt-2 max-h-24 rounded-lg border"
													src={message.imageUrl}
												/>
											)}
											{message.attachments &&
												message.attachments.length > 0 && (
													<div className="mt-2 space-y-1">
														{message.attachments.map((att, idx) => (
															<FileAttachmentDisplay
																key={`${message.$id}-${att.fileId}-${idx}`}
																attachment={att}
															/>
														))}
													</div>
												)}
										</div>
									</div>

									{/* Pinned info and jump button */}
									<div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
										<span>
											Pinned{" "}
											{message.pinnedAt
												? formatMessageTimestamp(message.pinnedAt)
												: ""}
										</span>
										{onJumpToMessage && (
											<Button
												className="h-6 text-xs"
												onClick={() => handleJump(message.$id)}
												size="sm"
												type="button"
												variant="ghost"
											>
												Jump to message
											</Button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Footer with count */}
				{pinnedMessages.length > 0 && (
					<div className="border-t pt-3 text-center text-xs text-muted-foreground">
						{pinnedMessages.length} pinned{" "}
						{pinnedMessages.length === 1 ? "message" : "messages"} (max 50)
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
