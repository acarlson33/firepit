"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/emoji-picker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ReactionPickerProps = {
	onSelectEmoji: (emoji: string) => Promise<void>;
	disabled?: boolean;
};

export function ReactionPicker({ onSelectEmoji, disabled }: ReactionPickerProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);

	async function handleEmojiSelect(emoji: string) {
		setLoading(true);
		try {
			await onSelectEmoji(emoji);
			setOpen(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					disabled={disabled || loading}
					size="sm"
					title="Add reaction"
					type="button"
					variant="ghost"
					className="h-7 w-7 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
				>
					<Smile className="h-4 w-4" />
					<span className="sr-only">Add reaction</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-auto p-0"
				side="top"
			>
				<EmojiPicker
					onEmojiSelect={(emoji) => void handleEmojiSelect(emoji)}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
