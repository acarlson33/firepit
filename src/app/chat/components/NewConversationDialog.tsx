"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
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
	const [userId, setUserId] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCreate = async () => {
		if (!userId.trim()) {
			setError("Please enter a user ID");
			return;
		}

		if (userId === currentUserId) {
			setError("You cannot message yourself");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const conversation = await getOrCreateConversation(currentUserId, userId);
			onConversationCreated(conversation);
			onOpenChange(false);
			setUserId("");
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
						<label className="text-sm" htmlFor="userId">
							Enter User ID
						</label>
						<div className="flex gap-2">
							<Input
								id="userId"
								onChange={(e) => {
									setUserId(e.target.value);
									setError(null);
								}}
								placeholder="user-id-here"
								value={userId}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										void handleCreate();
									}
								}}
							/>
							<Button disabled={loading} onClick={() => void handleCreate()}>
								{loading ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Search className="size-4" />
								)}
							</Button>
						</div>
						{error && (
							<p className="text-destructive text-sm">{error}</p>
						)}
					</div>

					<div className="rounded-md border border-border bg-muted/30 p-3">
						<p className="text-muted-foreground text-sm">
							<strong>Tip:</strong> You can find a user's ID by clicking their
							avatar in chat or visiting their profile page.
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
