"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Loader2, ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import type { DirectMessage, Conversation } from "@/lib/types";

type DirectMessageViewProps = {
	conversation: Conversation;
	messages: DirectMessage[];
	loading: boolean;
	sending: boolean;
	currentUserId: string;
	onSend: (text: string) => Promise<void>;
	onEdit: (messageId: string, newText: string) => Promise<void>;
	onDelete: (messageId: string) => Promise<void>;
	onBack?: () => void;
};

export function DirectMessageView({
	conversation,
	messages,
	loading,
	sending,
	currentUserId,
	onSend,
	onEdit,
	onDelete,
	onBack,
}: DirectMessageViewProps) {
	const [text, setText] = useState("");
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const otherUser = conversation.otherUser;
	const displayName =
		otherUser?.displayName || otherUser?.userId || "Unknown User";

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!text.trim() || sending) {
			return;
		}

		const messageText = text;
		setText("");

		try {
			if (editingMessageId) {
				await onEdit(editingMessageId, messageText);
				setEditingMessageId(null);
			} else {
				await onSend(messageText);
			}
		} catch (error) {
			// Re-set text on error so user can retry
			setText(messageText);
		}
	};

	const startEdit = (message: DirectMessage) => {
		setEditingMessageId(message.$id);
		setText(message.text);
	};

	const cancelEdit = () => {
		setEditingMessageId(null);
		setText("");
	};

	const confirmDelete = (messageId: string) => {
		setDeleteConfirmId(messageId);
	};

	const handleDelete = async (messageId: string) => {
		try {
			await onDelete(messageId);
			setDeleteConfirmId(null);
		} catch {
			// Error handled by parent
		}
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-3 border-border border-b bg-background p-3">
				{onBack && (
					<Button onClick={onBack} size="sm" variant="ghost">
						<ArrowLeft className="size-4" />
					</Button>
				)}
				<div className="relative">
					<Avatar
						alt={displayName}
						fallback={displayName}
						size="sm"
						src={otherUser?.avatarUrl}
					/>
					{otherUser?.status && (
						<div className="absolute -bottom-0.5 -right-0.5">
							<StatusIndicator
								size="sm"
								status={otherUser.status as "online" | "away" | "busy" | "offline"}
							/>
						</div>
					)}
				</div>
				<div className="flex-1">
					<h3 className="font-semibold text-sm">{displayName}</h3>
					{otherUser?.status && (
						<p className="text-muted-foreground text-xs capitalize">
							{otherUser.status}
						</p>
					)}
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 space-y-3 overflow-y-auto p-4">
				{loading ? (
					<div className="space-y-3">
						{Array.from({ length: 5 }).map((_, i) => (
							<div className="flex gap-3" key={i}>
								<Skeleton className="size-8 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-16 w-full" />
								</div>
							</div>
						))}
					</div>
				) : messages.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<p className="text-muted-foreground text-sm">
							No messages yet. Start the conversation!
						</p>
					</div>
				) : (
					messages.map((message) => {
						const isMine = message.senderId === currentUserId;
						const isEditing = editingMessageId === message.$id;
						const isDeleting = deleteConfirmId === message.$id;
						const removed = Boolean(message.removedAt);
						const msgDisplayName =
							message.senderDisplayName || message.senderId;

						return (
							<div
								className={`flex gap-3 ${
									isEditing ? "rounded-lg bg-blue-50 p-2 ring-2 ring-blue-500/50 dark:bg-blue-950/20" : ""
								}`}
								key={message.$id}
							>
								<Avatar
									alt={msgDisplayName}
									fallback={msgDisplayName}
									size="sm"
									src={message.senderAvatarUrl}
								/>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-baseline gap-2 text-muted-foreground text-xs">
										<span className="font-medium text-foreground">
											{msgDisplayName}
										</span>
										{message.senderPronouns && (
											<span className="italic">({message.senderPronouns})</span>
										)}
										<span>
											{new Date(message.$createdAt).toLocaleTimeString()}
										</span>
										{message.editedAt && <span className="italic">(edited)</span>}
										{removed && (
											<span className="text-destructive">(removed)</span>
										)}
										{isEditing && (
											<span className="font-medium text-blue-600 dark:text-blue-400">
												Editing...
											</span>
										)}
									</div>
									<div className="flex items-start gap-2">
										<div className="flex-1 break-words">
											{removed ? (
												<span className="italic opacity-70">
													Message removed
												</span>
											) : (
												message.text
											)}
										</div>
										{isMine && !removed && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild disabled={isDeleting}>
													<Button
														aria-label="Message options"
														disabled={isDeleting}
														size="sm"
														type="button"
														variant="ghost"
													>
														<MoreVertical className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onClick={() => startEdit(message)}>
														Edit
													</DropdownMenuItem>
													{isEditing && (
														<>
															<DropdownMenuItem onClick={cancelEdit}>
																Cancel Edit
															</DropdownMenuItem>
														</>
													)}
													<DropdownMenuItem
														className="text-destructive"
														onClick={() => confirmDelete(message.$id)}
													>
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</div>
									{isDeleting && (
										<div className="mt-2 flex items-center gap-2 rounded border border-destructive bg-destructive/10 p-2">
											<span className="flex-1 text-sm">
												Delete this message?
											</span>
											<Button
												onClick={() => void handleDelete(message.$id)}
												size="sm"
												variant="destructive"
											>
												Delete
											</Button>
											<Button
												onClick={() => setDeleteConfirmId(null)}
												size="sm"
												variant="outline"
											>
												Cancel
											</Button>
										</div>
									)}
								</div>
							</div>
						);
					})
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="border-border border-t bg-background p-3">
				{editingMessageId && (
					<div className="mb-2 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 dark:bg-blue-950/20">
						<span className="text-blue-600 text-sm dark:text-blue-400">
							Editing message
						</span>
						<Button onClick={cancelEdit} size="sm" variant="ghost">
							Cancel
						</Button>
					</div>
				)}
				<form className="flex items-center gap-2" onSubmit={handleSend}>
					<Input
						aria-label={editingMessageId ? "Edit message" : "Message"}
						disabled={sending}
						onChange={(e) => setText(e.target.value)}
						placeholder="Type a message..."
						value={text}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void handleSend(e);
							}
							if (e.key === "Escape") {
								cancelEdit();
							}
						}}
					/>
					<Button disabled={sending || !text.trim()} type="submit">
						{sending ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Sending...
							</>
						) : editingMessageId ? (
							"Save"
						) : (
							"Send"
						)}
					</Button>
				</form>
			</div>
		</div>
	);
}
