"use client";

import { useEffect, useState, useMemo } from "react";
import { AtSign, Loader2, Users, Shield } from "lucide-react";
import type { UserProfileData } from "@/lib/types";
import type { MentionableRole } from "@/components/chat-input";

type MentionOption = 
    | { type: "user"; data: UserProfileData }
    | { type: "role"; data: MentionableRole }
    | { type: "everyone"; data: null };

interface PopupPosition {
	top: number;
	left: number;
	inputHeight?: number;
}

function computePopupPosition(position: PopupPosition) {
	const MENU_HEIGHT = 280; // max-h-64 + padding
	const INPUT_GAP = 8;
	const spaceAbove = position.top;
	const positionAbove = spaceAbove > MENU_HEIGHT;

	return {
		left: position.left,
		top: positionAbove
			? position.top - INPUT_GAP
			: position.top + (position.inputHeight ?? 0) + INPUT_GAP,
		transform: positionAbove ? 'translateY(-100%)' : 'translateY(0)',
	};
}

interface MentionAutocompleteProps {
	query: string;
	users: UserProfileData[];
	roles?: MentionableRole[];
	onSelect: (user: UserProfileData | MentionableRole | null) => void;
	onClose: () => void;
	position?: { top: number; left: number; inputHeight?: number };
	isLoading?: boolean;
	canMentionEveryone?: boolean;
}

export function MentionAutocomplete({
	query,
	users,
	roles = [],
	onSelect,
	onClose,
	position,
	isLoading = false,
	canMentionEveryone = false,
}: MentionAutocompleteProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Memoize options array to prevent unnecessary effect re-runs
	const options = useMemo<MentionOption[]>(() => {
		const result: MentionOption[] = [];

		// Add @all option if query matches and user can mention everyone
		if (canMentionEveryone && query.toLowerCase() === "all") {
			result.push({ type: "everyone", data: null });
		}

		// Add matching roles
		if (roles && roles.length > 0) {
			const filteredRoles = roles.filter(
				(role) =>
					role.name.toLowerCase().includes(query.toLowerCase()) ||
					role.id.includes(query.toLowerCase()),
			);
			result.push(...filteredRoles.map((role) => ({ type: "role" as const, data: role })));
		}

		// Add matching users
		const filteredUsers = users.filter((user) => {
			const searchTerm = query.toLowerCase();
			const displayName = (user.displayName || "").toLowerCase();
			const userId = (user.userId || "").toLowerCase();
			return displayName.includes(searchTerm) || userId.includes(searchTerm);
		});
		result.push(...filteredUsers.map((user) => ({ type: "user" as const, data: user })));

		return result;
	}, [canMentionEveryone, query, roles, users]);

	// Reset selected index when options change
	useEffect(() => {
		setSelectedIndex(0);
	}, [options]);

	// Clamp selected index to valid range
	const validSelectedIndex = Math.min(selectedIndex, Math.max(0, options.length - 1));

	// Handle keyboard navigation
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (options.length === 0 && !isLoading) {
				return;
			}

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) =>
						i < options.length - 1 ? i + 1 : i,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => (i > 0 ? i - 1 : i));
					break;
				case "Enter":
					e.preventDefault();
					if (options[validSelectedIndex]) {
						const option = options[validSelectedIndex];
						onSelect(option.type === "everyone" ? null : option.data);
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
	}, [options, validSelectedIndex, onSelect, onClose, isLoading]);

	return (
		<div
			className="fixed z-50 w-80 rounded-lg border-2 border-primary/30 bg-popover shadow-xl"
			style={position ? computePopupPosition(position) : undefined}
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
				) : options.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
						<Users className="size-8 text-muted-foreground/50" />
						<div className="text-sm text-muted-foreground">
							{query.length === 0 ? (
								<>Start typing to search for users</>
							) : (
								<>
									No matches found for <span className="font-medium">&quot;{query}&quot;</span>
								</>
							)}
						</div>
					</div>
				) : (
					<>
						{options.map((option, index) => {
							if (option.type === "everyone") {
								return (
									<button
										key="everyone-option"
										type="button"
										onClick={() => onSelect(null)}
										onMouseEnter={() => setSelectedIndex(index)}
										className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
											index === validSelectedIndex
												? "bg-primary text-primary-foreground shadow-sm"
												: "hover:bg-accent"
										}`}
									>
										<AtSign className={`size-8 shrink-0 ${index === validSelectedIndex ? "text-primary-foreground" : "text-primary"}`} />
										<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
											<span className="truncate font-semibold">
												Everyone
											</span>
											<span className={`truncate text-xs ${
												index === validSelectedIndex
													? "text-primary-foreground/80"
													: "text-muted-foreground"
											}`}>
												Mentions everyone in channel
											</span>
										</div>
										{index === validSelectedIndex && (
											<div className="shrink-0 text-xs font-medium whitespace-nowrap">
												Press Enter
											</div>
										)}
									</button>
								);
							}

							if (option.type === "role") {
								const role = option.data;
								return (
									<button
										key={`role-${role.id}`}
										type="button"
										onClick={() => onSelect(role)}
										onMouseEnter={() => setSelectedIndex(index)}
										className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
											index === validSelectedIndex
												? "bg-primary text-primary-foreground shadow-sm"
												: "hover:bg-accent"
										}`}
									>
										<Shield
											className="size-8 shrink-0 rounded p-1"
												style={{
													backgroundColor: `${role.color}33`,
													color: role.color,
												}}
										/>
										<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
											<span className="truncate font-semibold">
												{role.name}
											</span>
											<span className={`truncate text-xs ${
												index === validSelectedIndex
													? "text-primary-foreground/80"
													: "text-muted-foreground"
											}`}>
												{role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
											</span>
										</div>
										{index === validSelectedIndex && (
											<div className="shrink-0 text-xs font-medium whitespace-nowrap">
												Press Enter
											</div>
										)}
									</button>
								);
							}

							const user = option.data;
							return (
								<button
									key={`user:${user.userId}`}
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
							);
						})}
					</>
				)}
			</div>

			{/* Footer hint */}
			{!isLoading && options.length > 0 && (
				<div className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
					<span className="font-medium">Tip:</span> Use ↑↓ arrows to navigate • Enter to select • Esc to close
				</div>
			)}
		</div>
	);
}
