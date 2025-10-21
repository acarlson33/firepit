"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/appwrite-core";
import {
	actionHardDeleteBound,
	actionRestoreBound,
	actionSoftDeleteBound,
} from "./actions";

type ModerationMessage = {
	$id: string;
	removedAt?: string;
	removedBy?: string;
	serverId?: string;
	channelId?: string;
	text?: string;
	userId?: string;
};

type Props = {
	initialMessages: ModerationMessage[];
	badgeMap: Record<string, string[]>;
	isAdmin: boolean;
};

// Action buttons for each message
function ActionButtons({
	message,
	isAdmin,
}: {
	message: { $id: string; removedAt?: string };
	isAdmin: boolean;
}) {
	const removed = Boolean(message.removedAt);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<form action={actionSoftDeleteBound}>
					<input name="messageId" type="hidden" value={message.$id} />
					<button
						className="rounded-md bg-destructive px-3 py-1.5 text-destructive-foreground text-sm font-medium transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
						disabled={removed}
						type="submit"
					>
						Remove
					</button>
				</form>
				<form action={actionRestoreBound}>
					<input name="messageId" type="hidden" value={message.$id} />
					<button
						className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!removed}
						type="submit"
					>
						Restore
					</button>
				</form>
			</div>
			{isAdmin && (
				<form action={actionHardDeleteBound}>
					<input name="messageId" type="hidden" value={message.$id} />
					<button
						className="w-full rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-destructive text-xs font-medium transition-colors hover:bg-destructive/20"
						type="submit"
					>
						Permanently Delete (Admin)
					</button>
				</form>
			)}
		</div>
	);
}

export function ModerationMessageList({
	initialMessages,
	badgeMap,
	isAdmin,
}: Props) {
	const [messages, setMessages] = useState(initialMessages);

	useEffect(() => {
		// Subscribe to real-time updates for the messages collection
		const client = getBrowserClient();
		const databaseId = process.env.APPWRITE_DATABASE_ID;
		const messagesCollectionId = process.env.APPWRITE_COLLECTION_MESSAGES;

		if (!databaseId || !messagesCollectionId) {
			return;
		}

		const unsubscribe = client.subscribe(
			`databases.${databaseId}.collections.${messagesCollectionId}.documents`,
			(response: { events: string[]; payload: unknown }) => {
				const event = response.events[0];
				const payload = response.payload as unknown as ModerationMessage;

				if (event?.includes(".update")) {
					// Update existing message
					setMessages((prev) =>
						prev.map((m) => (m.$id === payload.$id ? { ...m, ...payload } : m)),
					);
				} else if (event?.includes(".delete")) {
					// Remove deleted message
					setMessages((prev) => prev.filter((m) => m.$id !== payload.$id));
				} else if (event?.includes(".create")) {
					// Add new message at the top
					setMessages((prev) => [payload, ...prev]);
				}
			},
		);

		return () => {
			unsubscribe();
		};
	}, []);

	// Update when initial messages change (e.g., filter applied)
	useEffect(() => {
		setMessages(initialMessages);
	}, [initialMessages]);

	if (messages.length === 0) {
		return (
			<div className="rounded border p-8 text-center text-muted-foreground">
				<p>No messages found.</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{messages.map((m) => {
				const removed = Boolean(m.removedAt);
				const authorBadges = badgeMap[m.userId || ""] || [];
				const removerBadges = badgeMap[m.removedBy || ""] || [];

				return (
					<div
						className={`rounded-lg border bg-card p-4 shadow-sm transition-all ${removed ? "border-destructive/50 bg-destructive/5" : ""}`}
						key={m.$id}
					>
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0 flex-1 space-y-2">
								{/* Server/Channel Info */}
								<div className="flex items-center gap-2 text-muted-foreground text-xs">
									<span className="font-medium">
										{m.serverId || "No Server"} / {m.channelId || "No Channel"}
									</span>
									{removed && (
										<span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
											Removed
										</span>
									)}
								</div>

								{/* Message Text */}
								<p className="wrap-break-word text-sm leading-relaxed">{m.text}</p>

								{/* Author and Metadata */}
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<span className="text-muted-foreground">
										User: <span className="font-mono">{m.userId?.slice(0, 8)}...</span>
									</span>
									{authorBadges.map((b) => (
										<span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-medium" key={b}>
											{b}
										</span>
									))}
									{removed && m.removedAt && (
										<>
											<span className="text-muted-foreground">•</span>
											<span className="text-muted-foreground">
												Removed: {new Date(m.removedAt).toLocaleString()}
											</span>
										</>
									)}
									{removed && m.removedBy && (
										<>
											<span className="text-muted-foreground">•</span>
											<span className="text-muted-foreground">
												By: <span className="font-mono">{m.removedBy.slice(0, 8)}...</span>
												{removerBadges.map((b) => (
													<span className="ml-1 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-medium" key={b}>
														{b}
													</span>
												))}
											</span>
										</>
									)}
								</div>

								{/* Message ID (smaller, less prominent) */}
								<div className="text-muted-foreground/70 text-[10px]">
									ID: <span className="font-mono">{m.$id}</span>
								</div>
							</div>

						{/* Action Buttons */}
						<ActionButtons message={m} isAdmin={isAdmin} />
					</div>
					</div>
				);
			})}
		</div>
	);
}
