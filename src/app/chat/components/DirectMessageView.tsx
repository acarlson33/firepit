"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MoreVertical, Loader2, ArrowLeft, MessageSquare, Image as ImageIcon, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import { ImageViewer } from "@/components/image-viewer";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { EmojiPicker } from "@/components/emoji-picker";
import { ChatInput } from "@/components/chat-input";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionPicker } from "@/components/reaction-picker";
import { MessageWithMentions } from "@/components/message-with-mentions";
import { MentionHelpTooltip } from "@/components/mention-help-tooltip";
import type { DirectMessage, Conversation } from "@/lib/types";
import { formatMessageTimestamp } from "@/lib/utils";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { toggleReaction } from "@/lib/reactions-client";

type DirectMessageViewProps = {
	conversation: Conversation;
	messages: DirectMessage[];
	loading: boolean;
	sending: boolean;
	currentUserId: string;
	onSend: (_text: string, _imageFileId?: string, _imageUrl?: string, _replyToId?: string) => Promise<void>;
	onEdit: (_messageId: string, _newText: string) => Promise<void>;
	onDelete: (_messageId: string) => Promise<void>;
	onBack?: () => void;
	typingUsers?: Record<string, { userId: string; userName?: string; updatedAt: string }>;
	onTypingChange?: (_text: string) => void;
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
	typingUsers = {},
	onTypingChange,
}: DirectMessageViewProps) {
	const [text, setText] = useState("");
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [replyingToMessage, setReplyingToMessage] = useState<DirectMessage | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [uploadingImage, setUploadingImage] = useState(false);
	const [viewingImage, setViewingImage] = useState<{ url: string; alt: string } | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const otherUser = conversation.otherUser;
	const displayName =
		otherUser?.displayName || otherUser?.userId || "Unknown User";

	// Custom emojis
	const { customEmojis, uploadEmoji } = useCustomEmojis();

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		if (messagesContainerRef.current) {
			// Scroll the container, not the entire page
			messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
		}
	}, [messages.length]); // Only scroll when message count changes, not on every update

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		if ((!text.trim() && !selectedImage) || sending) {
			return;
		}

		const messageText = text;
		const replyToId = replyingToMessage?.$id;
		let imageFileId: string | undefined;
		let imageUrl: string | undefined;

		// Upload image if selected
		if (selectedImage) {
			try {
				setUploadingImage(true);
				const result = await uploadImage(selectedImage);
				imageFileId = result.fileId;
				imageUrl = result.url;
			} catch (error) {
				console.error("Failed to upload image:", error);
				setUploadingImage(false);
				return;
			} finally {
				setUploadingImage(false);
			}
		}

		setText("");
	setSelectedImage(null);
	setImagePreview(null);
	setReplyingToMessage(null);

	try {
		if (editingMessageId) {
			await onEdit(editingMessageId, messageText);
			setEditingMessageId(null);
		} else {
			await onSend(messageText, imageFileId, imageUrl, replyToId);
		}
	} catch {
		// Re-set text on error so user can retry
		setText(messageText);
	}
};	const startEdit = (message: DirectMessage) => {
		setEditingMessageId(message.$id);
		setText(message.text);
		setReplyingToMessage(null);
	};

	const cancelEdit = () => {
		setEditingMessageId(null);
		setText("");
	};

	const startReply = (message: DirectMessage) => {
		setReplyingToMessage(message);
		setEditingMessageId(null);
	};

	const cancelReply = () => {
		setReplyingToMessage(null);
	};

	const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}

		// Validate file type
		if (!file.type.startsWith("image/")) {
			alert("Please select an image file");
			return;
		}

		// Validate file size (5MB)
		if (file.size > 5 * 1024 * 1024) {
			alert("Image must be less than 5MB");
			return;
		}

		setSelectedImage(file);

		// Create preview
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			setImagePreview(reader.result as string);
		});
		reader.readAsDataURL(file);
	};

	const removeImage = () => {
		setSelectedImage(null);
		setImagePreview(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
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

	const handleEmojiSelect = useCallback((emoji: string) => {
		setText((prev) => prev + emoji);
	}, []);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
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
			<div 
				ref={messagesContainerRef}
				className="h-[60vh] space-y-3 overflow-y-auto rounded-3xl border border-border/60 bg-background/70 p-4 shadow-inner"
			>
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
					<div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
						<MessageSquare className="mb-2 size-12 text-muted-foreground" />
						<p className="font-medium text-muted-foreground text-sm">
							No messages yet
						</p>
						<p className="max-w-xs text-muted-foreground/70 text-xs">
							Start the conversation! Send a message to begin chatting.
						</p>
					</div>
				) : (
					<>
						{messages.map((message) => {
						const isMine = message.senderId === currentUserId;
						const isEditing = editingMessageId === message.$id;
						const isDeleting = deleteConfirmId === message.$id;
						const removed = Boolean(message.removedAt);
						const msgDisplayName =
							message.senderDisplayName || message.senderId;

						return (
							<div
								className={`group flex gap-3 ${
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
											{formatMessageTimestamp(message.$createdAt)}
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
									{message.replyTo && (
										<div className="mt-1 rounded-lg border-l-2 border-muted-foreground/40 bg-muted/30 px-3 py-1.5 text-xs">
											<div className="font-medium text-muted-foreground">
												Replying to {message.replyTo.senderDisplayName || "Unknown"}
											</div>
											<div className="line-clamp-1 text-muted-foreground/80">
												{message.replyTo.text}
											</div>
										</div>
									)}
									<div className="flex items-start gap-2">
										<div className="flex-1 wrap-break-word space-y-2">
											{message.imageUrl && !removed && (
												<div className="mt-1">
													<ImageWithSkeleton
														alt="Uploaded image"
														className="max-h-96 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
														onClick={() => {
															if (message.imageUrl) {
																setViewingImage({
																	url: message.imageUrl,
																	alt: `Image from ${msgDisplayName}`,
																});
															}
														}}
														onKeyDown={(e) => {
															if (e.key === "Enter" || e.key === " ") {
																e.preventDefault();
																if (message.imageUrl) {
																	setViewingImage({
																		url: message.imageUrl,
																		alt: `Image from ${msgDisplayName}`,
																	});
																}
															}
														}}
														role="button"
														src={message.imageUrl}
														tabIndex={0}
													/>
												</div>
											)}
										{removed ? (
											<span className="italic opacity-70">
												Message removed
											</span>
										) : message.text ? (
											<p>
												<MessageWithMentions
													text={message.text}
													currentUserId={currentUserId}
												/>
											</p>
										) : null}
										</div>
										{!removed && (
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
													<DropdownMenuItem onClick={() => startReply(message)}>
														Reply
													</DropdownMenuItem>
													{isMine && (
														<>
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
														</>
													)}
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</div>
									{!removed && message.reactions && message.reactions.length > 0 && (
										<div className="mt-1 flex flex-wrap gap-1">
											{message.reactions.map((reaction) => (
												<ReactionButton
													key={reaction.emoji}
													currentUserId={currentUserId}
													reaction={reaction}
													customEmojis={customEmojis}
													onToggle={async (emoji, isAdding) => {
														try {
															await toggleReaction(message.$id, emoji, isAdding, true);
														} catch (error) {
															console.error("Failed to toggle DM reaction:", error);
														}
													}}
												/>
											))}
										</div>
									)}
									{!removed && (
										<div className="mt-1 flex items-center gap-1">
											<ReactionPicker
												customEmojis={customEmojis}
												onUploadCustomEmoji={uploadEmoji}
												onSelectEmoji={async (emoji) => {
													try {
														await toggleReaction(message.$id, emoji, true, true);
													} catch (error) {
														console.error("Failed to add DM reaction:", error);
													}
												}}
											/>
										</div>
									)}
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
					})}
					{Object.values(typingUsers).length > 0 && (
						<div className="flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
							<span className="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
							<span>
								{Object.values(typingUsers)
									.map((t) => t.userName || t.userId.slice(0, 6))
									.join(", ")}{" "}
								{Object.values(typingUsers).length > 1 ? "are" : "is"} typing...
							</span>
						</div>
					)}
				</>
				)}
				<div ref={messagesEndRef} />
			</div>

		{/* Input */}
		<div className="space-y-3">
			<MentionHelpTooltip />
			{replyingToMessage && (
				<div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
						<div className="flex-1">
							<div className="font-medium">
								Replying to {replyingToMessage.senderDisplayName || "Unknown"}
							</div>
							<div className="line-clamp-1 text-xs text-muted-foreground">
								{replyingToMessage.text}
							</div>
						</div>
						<Button onClick={cancelReply} size="sm" variant="ghost">
							Cancel
						</Button>
					</div>
				)}
				{editingMessageId && (
					<div className="flex items-center justify-between rounded-2xl border border-blue-200/60 bg-blue-50/60 px-4 py-3 text-sm dark:border-blue-500/40 dark:bg-blue-950/30">
						<span className="text-blue-700 dark:text-blue-300">
							Editing message
						</span>
						<Button onClick={cancelEdit} size="sm" variant="ghost">
							Cancel
						</Button>
					</div>
				)}
				{imagePreview && (
					<div className="relative mb-2 inline-block">
						<img
							alt="Upload preview"
							className="h-32 rounded-lg object-cover"
							src={imagePreview}
						/>
						<Button
							className="absolute -right-2 -top-2"
							onClick={removeImage}
							size="icon"
							type="button"
							variant="destructive"
						>
							<X className="size-4" />
						</Button>
					</div>
				)}
				<form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSend}>
					<input
						accept="image/*"
						className="hidden"
						onChange={handleImageSelect}
						ref={fileInputRef}
						type="file"
					/>
					<Button
						disabled={sending || uploadingImage || Boolean(editingMessageId)}
						onClick={() => fileInputRef.current?.click()}
						size="icon"
						type="button"
						variant="outline"
						className="shrink-0"
					>
						<ImageIcon className="size-4" />
					</Button>
					<EmojiPicker
						onEmojiSelect={handleEmojiSelect}
						customEmojis={customEmojis}
						onUploadCustomEmoji={uploadEmoji}
					/>
					<ChatInput
						aria-label={editingMessageId ? "Edit message" : "Message"}
						disabled={sending || uploadingImage}
						onChange={(newValue) => {
							setText(newValue);
							if (onTypingChange) {
								onTypingChange(newValue);
							}
						}}
						placeholder="Type a message..."
						value={text}
						className="flex-1 rounded-2xl border-border/60"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void handleSend(e as unknown as React.FormEvent);
							}
							if (e.key === "Escape") {
								cancelEdit();
							}
						}}
					/>
					<Button 
						disabled={sending || uploadingImage || (!text.trim() && !selectedImage)} 
						type="submit" 
						className="rounded-2xl shrink-0"
					>
						{sending || uploadingImage ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								{uploadingImage ? "Uploading..." : "Sending..."}
							</>
						) : editingMessageId ? (
							"Save"
						) : (
							"Send"
						)}
					</Button>
				</form>
			</div>
			{viewingImage && (
				<ImageViewer
					alt={viewingImage.alt}
					onClose={() => {
						setViewingImage(null);
					}}
					src={viewingImage.url}
				/>
			)}
		</div>
	);
}
