"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RelationshipActions } from "@/components/relationship-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { getOrCreateConversation } from "@/lib/appwrite-dms-client";
import { useRelationship } from "@/hooks/useRelationship";
import { toast } from "sonner";
import { AvatarWithFrame } from "./profile-background";
import { profilePrefetchPool } from "@/hooks/useProfilePrefetch";

type UserProfile = {
    userId: string;
    displayName?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    avatarFileId?: string;
    avatarUrl?: string;
    profileBackgroundColor?: string;
    profileBackgroundGradient?: string;
    profileBackgroundImageFileId?: string;
    profileBackgroundUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    status?: {
        status: "online" | "away" | "busy" | "offline";
        customMessage?: string;
        lastSeenAt: string;
    };
};

type UserProfileModalProps = {
    userId: string;
    userName?: string;
    displayName?: string;
    avatarUrl?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onStartDM?: (conversationId: string) => void;
};

export function UserProfileModal({
    userId,
    userName,
    displayName: initialDisplayName,
    avatarUrl: initialAvatarUrl,
    open,
    onOpenChange,
    onStartDM,
}: UserProfileModalProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startingDM, setStartingDM] = useState(false);
    const { userData } = useAuth();
    const { relationship } = useRelationship(userId);

    useEffect(() => {
        if (!open) {
            return;
        }

        const fetchProfile = async () => {
            setLoading(true);
            setError(null);

            const cached = profilePrefetchPool.getCachedProfile(userId);
            if (cached) {
                setProfile(cached as UserProfile);
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/users/${userId}/profile`);

                if (!response.ok) {
                    throw new Error("Failed to fetch profile");
                }

                const data = (await response.json()) as UserProfile;
                setProfile(data);
            } catch {
                setError("Unable to load profile");
            } finally {
                setLoading(false);
            }
        };

        void fetchProfile();
    }, [userId, open]);

    const displayName =
        profile?.displayName ||
        initialDisplayName ||
        userName ||
        "Unknown User";
    const avatarUrl = profile?.avatarUrl || initialAvatarUrl;

    const cardStyle = profile?.profileBackgroundUrl
        ? {
              backgroundImage: `url(${profile.profileBackgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
          }
        : profile?.profileBackgroundGradient
          ? { background: profile.profileBackgroundGradient }
          : profile?.profileBackgroundColor
            ? { background: profile.profileBackgroundColor }
            : undefined;

    const hasBackground = Boolean(cardStyle);

    async function handleStartDM() {
        if (!onStartDM) {
            return;
        }

        if (relationship && !relationship.canSendDirectMessage) {
            if (relationship.blockedByMe) {
                toast.error("Unblock this user to send a direct message");
            } else if (relationship.blockedMe) {
                toast.error("This user blocked you");
            } else {
                toast.error(
                    "This user only accepts direct messages from friends",
                );
            }
            return;
        }

        setStartingDM(true);
        try {
            if (!userData?.userId) {
                throw new Error("Not authenticated");
            }
            const currentUserId = userData.userId;

            const conversation = await getOrCreateConversation(
                currentUserId,
                userId,
            );
            onStartDM(conversation.$id);
            toast.success(`Started conversation with ${displayName}`);
        } catch {
            toast.error("Failed to start conversation");
        } finally {
            setStartingDM(false);
        }
    }

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent className="max-w-lg p-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>User Profile</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="space-y-4 p-6">
                        <div className="flex items-center gap-4">
                            <Skeleton className="size-20 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </div>
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : error ? (
                    <div className="py-8 text-center text-muted-foreground">
                        <p>{error}</p>
                    </div>
                ) : (
                    <div
                        className="relative overflow-hidden rounded-lg"
                        style={cardStyle}
                    >
                        {hasBackground && (
                            <div className="absolute inset-0 bg-black/40" />
                        )}
                        <div
                            className={`relative ${hasBackground ? "z-10" : ""} space-y-4 p-6`}
                        >
                            <div className="rounded-lg bg-black/20 backdrop-blur-sm p-4">
                                {/* Avatar and Name */}
                                <div className="flex items-center gap-4">
                                    <AvatarWithFrame
                                        avatarFramePreset={
                                            profile?.avatarFramePreset
                                        }
                                        avatarFrameUrl={profile?.avatarFrameUrl}
                                        avatarUrl={avatarUrl}
                                        displayName={displayName}
                                        size="lg"
                                    />
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-lg">
                                            {displayName}
                                        </h3>
                                        {profile?.pronouns && (
                                            <p className="text-foreground/90 text-sm">
                                                {profile.pronouns}
                                            </p>
                                        )}
                                        {profile?.status && (
                                            <div className="mt-1 flex items-center gap-2 text-sm">
                                                <span
                                                    className={`inline-block size-2 rounded-full ${
                                                        profile.status
                                                            .status === "online"
                                                            ? "bg-green-500"
                                                            : profile.status
                                                                    .status ===
                                                                "away"
                                                              ? "bg-yellow-500"
                                                              : profile.status
                                                                      .status ===
                                                                  "busy"
                                                                ? "bg-red-500"
                                                                : "bg-gray-400"
                                                    }`}
                                                />
                                                <span className="capitalize text-foreground/90">
                                                    {profile.status.status}
                                                </span>
                                                {profile.status
                                                    .customMessage && (
                                                    <span className="text-foreground/80">
                                                        -{" "}
                                                        {
                                                            profile.status
                                                                .customMessage
                                                        }
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Bio */}
                                {profile?.bio && (
                                    <div className="space-y-2 mt-4">
                                        <h4 className="font-medium text-sm">
                                            About
                                        </h4>
                                        <p className="whitespace-pre-wrap text-foreground text-sm">
                                            {profile.bio}
                                        </p>
                                    </div>
                                )}

                                {/* Additional Info */}
                                {(profile?.location || profile?.website) && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-sm">
                                            Information
                                        </h4>
                                        <div className="space-y-1 text-sm">
                                            {profile.location && (
                                                <div className="flex gap-2">
                                                    <span className="text-foreground/80">
                                                        Location:
                                                    </span>
                                                    <span>
                                                        {profile.location}
                                                    </span>
                                                </div>
                                            )}
                                            {profile.website && (
                                                <div className="flex gap-2">
                                                    <span className="text-foreground/80">
                                                        Website:
                                                    </span>
                                                    <a
                                                        className="text-primary hover:underline"
                                                        href={profile.website}
                                                        rel="noopener noreferrer"
                                                        target="_blank"
                                                    >
                                                        {profile.website}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="space-y-2 pt-2">
                                    {onStartDM && (
                                        <Button
                                            className="w-full"
                                            disabled={
                                                startingDM ||
                                                Boolean(
                                                    relationship &&
                                                    !relationship.canSendDirectMessage,
                                                )
                                            }
                                            onClick={() => void handleStartDM()}
                                            variant="default"
                                        >
                                            <MessageSquare className="mr-2 h-4 w-4" />
                                            {startingDM
                                                ? "Starting..."
                                                : "Send Direct Message"}
                                        </Button>
                                    )}
                                    <RelationshipActions
                                        displayName={displayName}
                                        fullWidth
                                        targetUserId={userId}
                                    />
                                    <Button
                                        asChild
                                        className="w-full"
                                        variant="secondary"
                                    >
                                        <Link href={`/profile/${userId}`}>
                                            View Full Profile
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
