"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrCreateConversation } from "@/lib/appwrite-dms";
import { toast } from "sonner";

type StartDMButtonProps = {
	targetUserId: string;
	displayName: string;
};

export function StartDMButton({ targetUserId, displayName }: StartDMButtonProps) {
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleStartDM() {
		setLoading(true);
		try {
			// Get current user ID from /api/me
			const meResponse = await fetch("/api/me");
			if (!meResponse.ok) {
				throw new Error("Not authenticated");
			}
			const { userId: currentUserId } = await meResponse.json();

			// Don't allow DM to self
			if (currentUserId === targetUserId) {
				toast.error("You cannot send a message to yourself");
				return;
			}

			const conversation = await getOrCreateConversation(currentUserId, targetUserId);
			toast.success(`Started conversation with ${displayName}`);
			
			// Navigate to chat page with DM view
			router.push(`/chat?dm=${conversation.$id}`);
		} catch (err) {
			toast.error("Failed to start conversation");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			disabled={loading}
			onClick={() => void handleStartDM()}
			variant="default"
		>
			<MessageSquare className="mr-2 h-4 w-4" />
			{loading ? "Starting..." : "Send Direct Message"}
		</Button>
	);
}
