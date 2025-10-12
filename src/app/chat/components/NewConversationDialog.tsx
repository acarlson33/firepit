"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, User } from "lucide-react";
import Image from "next/image";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getOrCreateConversation } from "@/lib/appwrite-dms";
import type { Conversation } from "@/lib/types";

type UserSearchResult = {
	userId: string;
	displayName?: string;
	pronouns?: string;
	avatarUrl?: string;
};

type NewConversationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentUserId: string;
	onConversationCreated: (conversation: Conversation) => void;
};

export function NewConversationDialog({
	open,
	onOpenChange,
	currentUserId,
	onConversationCreated,
}: NewConversationDialogProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Search for users as user types
	useEffect(() => {
		if (!open) {
			return;
		}

		if (searchQuery.length < 2) {
			setSearchResults([]);
			return;
		}

		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		searchTimeoutRef.current = setTimeout(() => {
			void searchUsers(searchQuery);
		}, 300);

		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, [searchQuery, open]);

	// Reset state when dialog opens/closes
	useEffect(() => {
		if (!open) {
			setSearchQuery("");
			setSearchResults([]);
			setSelectedUser(null);
			setError(null);
		}
	}, [open]);

	const searchUsers = async (query: string) => {
		setSearching(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/users/search?q=${encodeURIComponent(query)}`,
			);

			if (!response.ok) {
				throw new Error("Failed to search users");
			}

			const data = await response.json();
			
			// Filter out current user from results
			const filteredUsers = data.users.filter(
				(user: UserSearchResult) => user.userId !== currentUserId,
			);
			
			setSearchResults(filteredUsers);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to search users",
			);
			setSearchResults([]);
		} finally {
			setSearching(false);
		}
	};

	const handleSelectUser = (user: UserSearchResult) => {
		setSelectedUser(user);
		setSearchQuery(user.displayName || user.userId);
		setSearchResults([]);
	};

	const handleCreate = async () => {
		if (!selectedUser) {
			setError("Please select a user from the search results");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const conversation = await getOrCreateConversation(
				currentUserId,
				selectedUser.userId,
			);
			onConversationCreated(conversation);
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create conversation",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Start a Conversation</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm" htmlFor="userSearch">
							Search by name or user ID
						</label>
						<div className="relative">
							<div className="flex gap-2">
								<div className="relative flex-1">
									<Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
									<Input
										id="userSearch"
										className="pl-9"
										onChange={(e) => {
											setSearchQuery(e.target.value);
											setSelectedUser(null);
											setError(null);
										}}
										placeholder="Type to search..."
										value={searchQuery}
										autoComplete="off"
									/>
									{searching && (
										<Loader2 className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground" />
									)}
								</div>
							</div>

							{/* Search Results Dropdown */}
							{searchResults.length > 0 && (
								<div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
									<div className="max-h-60 overflow-y-auto p-1">
										{searchResults.map((user) => (
											<button
												className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left hover:bg-accent"
												key={user.userId}
												onClick={() => handleSelectUser(user)}
												type="button"
											>
												{user.avatarUrl ? (
													<div className="relative size-8 overflow-hidden rounded-full">
														<Image
															alt={user.displayName || user.userId}
															className="object-cover"
															fill
															sizes="32px"
															src={user.avatarUrl}
														/>
													</div>
												) : (
													<div className="flex size-8 items-center justify-center rounded-full bg-muted">
														<User className="size-4 text-muted-foreground" />
													</div>
												)}
												<div className="flex-1 overflow-hidden">
													<p className="truncate font-medium text-sm">
														{user.displayName || user.userId}
													</p>
													{user.displayName && (
														<p className="truncate text-muted-foreground text-xs">
															{user.userId}
														</p>
													)}
													{user.pronouns && (
														<p className="truncate text-muted-foreground text-xs italic">
															{user.pronouns}
														</p>
													)}
												</div>
											</button>
										))}
									</div>
								</div>
							)}

							{/* No Results Message */}
							{!searching &&
								searchQuery.length >= 2 &&
								searchResults.length === 0 && (
									<div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover p-4 text-center shadow-md">
										<p className="text-muted-foreground text-sm">
											No users found matching &quot;{searchQuery}&quot;
										</p>
									</div>
								)}
						</div>

						{error && <p className="text-destructive text-sm">{error}</p>}

						{/* Selected User Display */}
						{selectedUser && (
							<div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
								{selectedUser.avatarUrl ? (
									<div className="relative size-10 overflow-hidden rounded-full">
										<Image
											alt={selectedUser.displayName || selectedUser.userId}
											className="object-cover"
											fill
											sizes="40px"
											src={selectedUser.avatarUrl}
										/>
									</div>
								) : (
									<div className="flex size-10 items-center justify-center rounded-full bg-muted">
										<User className="size-5 text-muted-foreground" />
									</div>
								)}
								<div className="flex-1">
									<p className="font-medium text-sm">
										{selectedUser.displayName || selectedUser.userId}
									</p>
									{selectedUser.displayName && (
										<p className="text-muted-foreground text-xs">
											{selectedUser.userId}
										</p>
									)}
								</div>
							</div>
						)}
					</div>

					<Button
						className="w-full"
						disabled={loading || !selectedUser}
						onClick={() => void handleCreate()}
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Starting conversation...
							</>
						) : (
							"Start Conversation"
						)}
					</Button>

					<div className="rounded-md border border-border bg-muted/30 p-3">
						<p className="text-muted-foreground text-sm">
							<strong>Tip:</strong> Search by display name (e.g., &quot;John
							Doe&quot;) or user ID to find someone to message.
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
