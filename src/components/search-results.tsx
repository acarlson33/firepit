"use client";

import { formatDistanceToNow } from "date-fns";
import { Hash, MessageSquare, Image as ImageIcon } from "lucide-react";
import type { Message, DirectMessage } from "@/lib/types";

type SearchResult = {
	type: "channel" | "dm";
	message: Message | DirectMessage;
};

type SearchResultsProps = {
	results: SearchResult[];
	onClose: () => void;
};

function formatTimestamp(timestamp: string): string {
	try {
		const date = new Date(timestamp);
		return formatDistanceToNow(date, { addSuffix: true });
	} catch {
		return timestamp;
	}
}

function truncateText(text: string, maxLength = 150): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength)}...`;
}

function UserAvatar({
	avatarUrl,
	displayName,
	size = "md",
}: {
	avatarUrl?: string;
	displayName?: string;
	size?: "sm" | "md" | "lg";
}) {
	const sizeClasses = {
		sm: "size-6 text-xs",
		md: "size-10 text-sm",
		lg: "size-12 text-base",
	};

	return (
		<div
			className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${sizeClasses[size]}`}
		>
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt={`${displayName || "User"} avatar`}
					className="size-full object-cover"
				/>
			) : (
				<div className="flex size-full items-center justify-center bg-primary/10 font-semibold text-primary">
					{displayName?.charAt(0).toUpperCase() || "?"}
				</div>
			)}
		</div>
	);
}

export function SearchResults({ results, onClose }: SearchResultsProps) {
	const handleResultClick = (result: SearchResult) => {
		if (result.type === "channel") {
			const message = result.message as Message;
			if (message.channelId) {
				// Navigate to the channel and highlight the message
				window.location.href = `/chat?channel=${message.channelId}&highlight=${message.$id}`;
				onClose();
			}
		} else {
			const dm = result.message as DirectMessage;
			if (dm.conversationId) {
				// Navigate to the DM conversation and highlight the message
				window.location.href = `/chat?conversation=${dm.conversationId}&highlight=${dm.$id}`;
				onClose();
			}
		}
	};

	return (
		<div className="divide-y">
			{results.map((result) => {
				const isChannel = result.type === "channel";
				const message = result.message;

				const displayName = isChannel
					? (message as Message).displayName || (message as Message).userName
					: (message as DirectMessage).senderDisplayName;

				const avatarUrl = isChannel
					? (message as Message).avatarUrl
					: (message as DirectMessage).senderAvatarUrl;

				const hasImage = Boolean(message.imageFileId);

				return (
					<button
						key={message.$id}
						type="button"
						onClick={() => handleResultClick(result)}
						className="flex w-full items-start gap-3 px-6 py-4 text-left transition-colors hover:bg-accent"
					>
						<UserAvatar avatarUrl={avatarUrl} displayName={displayName} />

						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm">
									{displayName || "Unknown User"}
								</span>

								{isChannel && (message as Message).channelId && (
									<div className="flex items-center gap-1 text-muted-foreground text-xs">
										<Hash className="size-3" />
										<span>channel</span>
									</div>
								)}

								{!isChannel && (
									<div className="flex items-center gap-1 text-muted-foreground text-xs">
										<MessageSquare className="size-3" />
										<span>DM</span>
									</div>
								)}

								<span className="text-muted-foreground text-xs">
									{formatTimestamp(message.$createdAt)}
								</span>

								{hasImage && (
									<div className="flex items-center gap-1 text-muted-foreground text-xs">
										<ImageIcon className="size-3" />
									</div>
								)}
							</div>

							<p className="mt-1 text-muted-foreground text-sm">
								{truncateText(message.text)}
							</p>

							{message.editedAt && (
								<span className="mt-1 text-muted-foreground text-xs italic">
									(edited)
								</span>
							)}
						</div>
					</button>
				);
			})}
		</div>
	);
}
