"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import Image from "next/image";
import { Virtuoso } from "react-virtuoso";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message, DirectMessage } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

type ThreadDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	parentMessage: Message | DirectMessage;
	currentUserId: string;
	isDirectMessage?: boolean;
};

export function ThreadDialog({
	open,
	onOpenChange,
	parentMessage,
	currentUserId,
	isDirectMessage = false,
}: ThreadDialogProps) {
	const [replies, setReplies] = useState<(Message | DirectMessage)[]>([]);
	const [loading, setLoading] = useState(false);
	const [sending, setSending] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Fetch thread replies when dialog opens
	useEffect(() => {
		if (open) {
			void fetchThreadReplies();
		}
	}, [open, parentMessage.$id]);

	const fetchThreadReplies = async () => {
		setLoading(true);
		setError(null);

		try {
			const endpoint = isDirectMessage
				? `/api/direct-messages/${parentMessage.$id}/thread`
				: `/api/messages/${parentMessage.$id}/thread`;

			const response = await fetch(endpoint);

			if (!response.ok) {
				throw new Error("Failed to fetch thread replies");
			}

			const data = await response.json();
			setReplies(data.replies || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load thread");
		} finally {
			setLoading(false);
		}
	};

	const handleSendReply = async () => {
		if (!replyText.trim() || sending) {
			return;
		}

		setSending(true);
		setError(null);

		try {
			const endpoint = isDirectMessage
				? `/api/direct-messages/${parentMessage.$id}/thread`
				: `/api/messages/${parentMessage.$id}/thread`;

			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text: replyText.trim(),
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to send reply");
			}

			const data = await response.json();
			setReplies((prev) => [...prev, data.reply]);
			setReplyText("");

			// Focus back on textarea
			textareaRef.current?.focus();
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

	// Get the display name for a message
	const getDisplayName = (msg: Message | DirectMessage): string => {
		if ("displayName" in msg && msg.displayName) {
			return msg.displayName;
		}
		if ("senderDisplayName" in msg && msg.senderDisplayName) {
			return msg.senderDisplayName;
		}
		if ("userName" in msg && msg.userName) {
			return msg.userName;
		}
		return "Unknown";
	};

	// Get avatar URL for a message
	const getAvatarUrl = (msg: Message | DirectMessage): string | undefined => {
		if ("avatarUrl" in msg) {
			return msg.avatarUrl;
		}
		if ("senderAvatarUrl" in msg) {
			return msg.senderAvatarUrl;
		}
		return undefined;
	};

	// Get user ID for a message
	const getUserId = (msg: Message | DirectMessage): string => {
		if ("userId" in msg) {
			return msg.userId;
		}
		return msg.senderId;
	};

	const renderMessage = useCallback(
		(index: number) => {
			const msg = replies[index];
			const isMine = getUserId(msg) === currentUserId;
			const displayName = getDisplayName(msg);
			const avatarUrl = getAvatarUrl(msg);
			const timeAgo = formatDistanceToNow(new Date(msg.$createdAt), {
				addSuffix: true,
			});

			return (
				<div
					key={msg.$id}
					className={`flex gap-3 p-3 ${isMine ? "justify-end" : ""}`}
				>
					{!isMine && (
						<div className="flex-shrink-0">
							{avatarUrl ? (
								<Image
									src={avatarUrl}
									alt={displayName}
									width={32}
									height={32}
									className="rounded-full"
								/>
							) : (
								<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
									<MessageSquare className="h-4 w-4 text-muted-foreground" />
								</div>
							)}
						</div>
					)}
					<div
						className={`flex flex-col ${isMine ? "items-end" : ""} max-w-[70%]`}
					>
						<div className="flex items-baseline gap-2">
							<span className="text-sm font-medium">{displayName}</span>
							<span className="text-xs text-muted-foreground">{timeAgo}</span>
						</div>
						<div
							className={`mt-1 rounded-lg px-3 py-2 ${
								isMine
									? "bg-primary text-primary-foreground"
									: "bg-muted"
							}`}
						>
							<p className="whitespace-pre-wrap break-words text-sm">
								{msg.text}
							</p>
						</div>
					</div>
				</div>
			);
		},
		[replies, currentUserId]
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[80vh] max-w-2xl flex-col p-0">
				<DialogHeader className="border-b px-6 py-4">
					<DialogTitle className="flex items-center gap-2">
						<MessageSquare className="h-5 w-5" />
						Thread
					</DialogTitle>
				</DialogHeader>

				{/* Parent message */}
				<div className="border-b bg-muted/50 p-4">
					<div className="flex gap-3">
						<div className="flex-shrink-0">
							{getAvatarUrl(parentMessage) ? (
								<Image
									src={getAvatarUrl(parentMessage)!}
									alt={getDisplayName(parentMessage)}
									width={40}
									height={40}
									className="rounded-full"
								/>
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
									<MessageSquare className="h-5 w-5 text-muted-foreground" />
								</div>
							)}
						</div>
						<div className="flex-1">
							<div className="flex items-baseline gap-2">
								<span className="font-medium">
									{getDisplayName(parentMessage)}
								</span>
								<span className="text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(parentMessage.$createdAt), {
										addSuffix: true,
									})}
								</span>
							</div>
							<p className="mt-1 whitespace-pre-wrap break-words text-sm">
								{parentMessage.text}
							</p>
						</div>
					</div>
				</div>

				{/* Thread replies */}
				<div className="flex-1 overflow-hidden">
					{loading ? (
						<div className="flex h-full items-center justify-center">
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<div className="flex h-full items-center justify-center">
							<p className="text-sm text-destructive">{error}</p>
						</div>
					) : replies.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
							<MessageSquare className="h-12 w-12" />
							<p className="text-sm">No replies yet</p>
							<p className="text-xs">Be the first to reply!</p>
						</div>
					) : replies.length > 50 ? (
						<Virtuoso
							data={replies}
							itemContent={renderMessage}
							className="h-full"
						/>
					) : (
						<div className="h-full overflow-y-auto">
							{replies.map((_, index) => renderMessage(index))}
						</div>
					)}
				</div>

				{/* Reply input */}
				<div className="border-t p-4">
					<div className="flex gap-2">
						<Textarea
							ref={textareaRef}
							placeholder="Reply in thread..."
							value={replyText}
							onChange={(e) => setReplyText(e.target.value)}
							onKeyDown={handleKeyDown}
							className="min-h-[60px] resize-none"
							disabled={sending}
						/>
						<Button
							onClick={() => void handleSendReply()}
							disabled={!replyText.trim() || sending}
							size="icon"
							className="h-[60px] w-[60px]"
						>
							{sending ? (
								<Loader2 className="h-5 w-5 animate-spin" />
							) : (
								<Send className="h-5 w-5" />
							)}
						</Button>
					</div>
					{error && (
						<p className="mt-2 text-sm text-destructive">{error}</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
