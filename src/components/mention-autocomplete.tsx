"use client";

import { useEffect, useState } from "react";
import { AtSign, Loader2, Users } from "lucide-react";
import type { UserProfileData } from "@/lib/types";

interface MentionAutocompleteProps {
	query: string;
	users: UserProfileData[];
	onSelect: (user: UserProfileData) => void;
	onClose: () => void;
	position?: { top: number; left: number };
	isLoading?: boolean;
}

export function MentionAutocomplete({
	query,
	users,
	onSelect,
	onClose,
	position,
	isLoading = false,
}: MentionAutocompleteProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Filter users based on query
	const filteredUsers = users.filter((user) => {
		const searchTerm = query.toLowerCase();
		const displayName = (user.displayName || "").toLowerCase();
		const userId = (user.userId || "").toLowerCase();
		return displayName.includes(searchTerm) || userId.includes(searchTerm);
	});

	// Clamp selected index to valid range
	const validSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredUsers.length - 1));

	// Handle keyboard navigation
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (filteredUsers.length === 0 && !isLoading) {
				return;
			}

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) =>
						i < filteredUsers.length - 1 ? i + 1 : i,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => (i > 0 ? i - 1 : i));
					break;
				case "Enter":
					e.preventDefault();
					if (filteredUsers[validSelectedIndex]) {
						onSelect(filteredUsers[validSelectedIndex]);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [filteredUsers, validSelectedIndex, onSelect, onClose, isLoading]);

	return (
		<div
			className="fixed z-50 w-80 rounded-lg border-2 border-primary/30 bg-popover shadow-xl"
			style={
				position
					? { 
						top: position.top, 
						left: position.left,
						transform: 'translateY(-100%)', // Position above the anchor point
					}
					: undefined
			}
		>
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
				<AtSign className="size-4 text-primary" />
				<span className="text-sm font-semibold">Mention Someone</span>
			</div>

			{/* Content */}
			<div className="max-h-64 overflow-y-auto p-1">
				{isLoading ? (
					<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						<span>Searching for users...</span>
					</div>
				) : filteredUsers.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
						<Users className="size-8 text-muted-foreground/50" />
						<div className="text-sm text-muted-foreground">
							{query.length === 0 ? (
								<>Start typing to search for users</>
							) : (
								<>
									No users found matching <span className="font-medium">&quot;{query}&quot;</span>
								</>
							)}
						</div>
					</div>
				) : (
					<>
						{filteredUsers.map((user, index) => (
							<button
								key={user.userId}
								type="button"
								onClick={() => onSelect(user)}
								onMouseEnter={() => setSelectedIndex(index)}
								className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
									index === validSelectedIndex
										? "bg-primary text-primary-foreground shadow-sm"
										: "hover:bg-accent"
								}`}
							>
								{user.avatarUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={user.avatarUrl}
										alt=""
										className="size-8 shrink-0 rounded-full object-cover ring-2 ring-border"
									/>
								) : (
									<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-2 ring-border">
										{(user.displayName || user.userId || "?")[0].toUpperCase()}
									</div>
								)}
								<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
									<span className="truncate font-semibold">
										{user.displayName || user.userId || "Unknown User"}
									</span>
									<span className={`truncate text-xs ${
										index === validSelectedIndex
											? "text-primary-foreground/80"
											: "text-muted-foreground"
									}`}>
										@{user.userId}
									</span>
								</div>
								{index === validSelectedIndex && (
									<div className="shrink-0 text-xs font-medium whitespace-nowrap">
										Press Enter
									</div>
								)}
							</button>
						))}
					</>
				)}
			</div>

			{/* Footer hint */}
			{!isLoading && filteredUsers.length > 0 && (
				<div className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
					<span className="font-medium">Tip:</span> Use ↑↓ arrows to navigate • Enter to select • Esc to close
				</div>
			)}
		</div>
	);
}
