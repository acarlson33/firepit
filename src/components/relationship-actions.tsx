"use client";

import {
    ShieldBan,
    ShieldCheck,
    UserMinus,
    UserPlus,
    Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRelationship } from "@/hooks/useRelationship";

type RelationshipActionsProps = {
    targetUserId: string;
    displayName: string;
    fullWidth?: boolean;
};

export function RelationshipActions({
    targetUserId,
    displayName,
    fullWidth = false,
}: RelationshipActionsProps) {
    const {
        relationship,
        loading,
        actionLoading,
        error,
        isSelf,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
        blockUser,
        unblockUser,
    } = useRelationship(targetUserId);

    if (isSelf) {
        return null;
    }

    const widthClass = fullWidth ? "w-full" : undefined;

    async function handleAction(
        action: () => Promise<boolean>,
        successMessage: string,
    ) {
        const succeeded = await action();
        if (succeeded) {
            toast.success(successMessage);
            return;
        }

        if (error) {
            toast.error(error);
        }
    }

    return (
        <div className="space-y-3">
            {relationship ? (
                <div className="flex flex-wrap gap-2">
                    {relationship.isFriend ? (
                        <Badge variant="secondary">Friend</Badge>
                    ) : null}
                    {relationship.incomingRequest ? (
                        <Badge variant="secondary">Incoming request</Badge>
                    ) : null}
                    {relationship.outgoingRequest ? (
                        <Badge variant="outline">Request sent</Badge>
                    ) : null}
                    {relationship.blockedByMe ? (
                        <Badge variant="destructive">Blocked</Badge>
                    ) : null}
                    {relationship.blockedMe ? (
                        <Badge variant="outline">Blocked you</Badge>
                    ) : null}
                    {relationship.directMessagePrivacy === "friends" ? (
                        <Badge variant="outline">Friends-only DMs</Badge>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
                {relationship?.incomingRequest ? (
                    <>
                        <Button
                            className={widthClass}
                            disabled={loading || actionLoading}
                            onClick={() =>
                                void handleAction(
                                    acceptFriendRequest,
                                    `You are now friends with ${displayName}`,
                                )
                            }
                            type="button"
                        >
                            <Users className="mr-2 h-4 w-4" />
                            Accept
                        </Button>
                        <Button
                            className={widthClass}
                            disabled={loading || actionLoading}
                            onClick={() =>
                                void handleAction(
                                    declineFriendRequest,
                                    `Declined request from ${displayName}`,
                                )
                            }
                            type="button"
                            variant="outline"
                        >
                            Decline
                        </Button>
                    </>
                ) : relationship?.isFriend ? (
                    <Button
                        className={widthClass}
                        disabled={loading || actionLoading}
                        onClick={() =>
                            void handleAction(
                                removeFriendship,
                                `Removed ${displayName} from friends`,
                            )
                        }
                        type="button"
                        variant="outline"
                    >
                        <UserMinus className="mr-2 h-4 w-4" />
                        Remove Friend
                    </Button>
                ) : relationship?.outgoingRequest ? (
                    <Button
                        className={widthClass}
                        disabled={loading || actionLoading}
                        onClick={() =>
                            void handleAction(
                                removeFriendship,
                                `Canceled request to ${displayName}`,
                            )
                        }
                        type="button"
                        variant="outline"
                    >
                        <UserMinus className="mr-2 h-4 w-4" />
                        Cancel Request
                    </Button>
                ) : relationship?.canReceiveFriendRequest ? (
                    <Button
                        className={widthClass}
                        disabled={loading || actionLoading}
                        onClick={() =>
                            void handleAction(
                                sendFriendRequest,
                                `Sent a friend request to ${displayName}`,
                            )
                        }
                        type="button"
                        variant="secondary"
                    >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Friend
                    </Button>
                ) : null}

                {relationship?.blockedByMe ? (
                    <Button
                        className={widthClass}
                        disabled={loading || actionLoading}
                        onClick={() =>
                            void handleAction(
                                unblockUser,
                                `Unblocked ${displayName}`,
                            )
                        }
                        type="button"
                        variant="outline"
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Unblock
                    </Button>
                ) : (
                    <Button
                        className={widthClass}
                        disabled={
                            loading || actionLoading || relationship?.blockedMe
                        }
                        onClick={() =>
                            void handleAction(
                                () => blockUser(),
                                `Blocked ${displayName}`,
                            )
                        }
                        type="button"
                        variant="destructive"
                    >
                        <ShieldBan className="mr-2 h-4 w-4" />
                        Block
                    </Button>
                )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
    );
}
