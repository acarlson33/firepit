"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useRelationship } from "@/hooks/useRelationship";
import { getOrCreateConversation } from "@/lib/appwrite-dms-client";
import { toast } from "sonner";

type StartDMButtonProps = {
    targetUserId: string;
    displayName: string;
    onConversationStarted?: (conversationId: string) => void;
    fullWidth?: boolean;
};

export function StartDMButton({
    targetUserId,
    displayName,
    onConversationStarted,
    fullWidth = false,
}: StartDMButtonProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { userData } = useAuth();
    const { relationship, loading: relationshipLoading } =
        useRelationship(targetUserId);
    const isSelf = userData?.userId === targetUserId;
    const cannotSendDirectMessage = Boolean(
        relationship && !relationship.canSendDirectMessage,
    );

    const disabled =
        loading ||
        relationshipLoading ||
        !userData?.userId ||
        isSelf ||
        cannotSendDirectMessage;

    const buttonLabel = isSelf
        ? "This is you"
        : relationship?.blockedByMe
          ? "Blocked"
          : relationship?.blockedMe
            ? "Unavailable"
            : relationship?.directMessagePrivacy === "friends" &&
                !relationship.isFriend
              ? "Friends-only DMs"
              : loading
                ? "Starting..."
                : "Send Direct Message";

    async function handleStartDM() {
        if (disabled) {
            if (relationship?.blockedByMe) {
                toast.error("Unblock this user to send a direct message");
            } else if (relationship?.blockedMe) {
                toast.error("This user blocked you");
            } else if (
                relationship?.directMessagePrivacy === "friends" &&
                !relationship.isFriend
            ) {
                toast.error(
                    "This user only accepts direct messages from friends",
                );
            }
            return;
        }

        setLoading(true);
        try {
            // Get current user ID from auth context
            if (!userData?.userId) {
                throw new Error("Not authenticated");
            }
            const currentUserId = userData.userId;

            // Don't allow DM to self
            if (currentUserId === targetUserId) {
                toast.error("You cannot send a message to yourself");
                return;
            }

            const conversation = await getOrCreateConversation(
                currentUserId,
                targetUserId,
            );
            toast.success(`Started conversation with ${displayName}`);

            if (onConversationStarted) {
                onConversationStarted(conversation.$id);
                return;
            }

            router.push(`/chat?dm=${conversation.$id}`);
        } catch {
            toast.error("Failed to start conversation");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Button
            className={fullWidth ? "w-full" : undefined}
            disabled={disabled}
            onClick={() => void handleStartDM()}
            variant="default"
        >
            <MessageSquare className="mr-2 h-4 w-4" />
            {buttonLabel}
        </Button>
    );
}
