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
import { ReportUserDialog } from "./report-user-dialog";
import { profilePrefetchPool } from "@/hooks/useProfilePrefetch";
import { getProfileBackgroundStyle } from "@/lib/profile-utils";
import { logger } from "@/lib/client-logger";

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

function isUserProfile(value: unknown): value is UserProfile {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    const hasValidStatus = (() => {
        if (candidate.status === undefined) {
            return true;
        }

        if (!candidate.status || typeof candidate.status !== "object") {
            return false;
        }

        const status = candidate.status as Record<string, unknown>;
        const validStatusValues = ["online", "away", "busy", "offline"];

        return (
            typeof status.status === "string" &&
            validStatusValues.includes(status.status) &&
            (status.customMessage === undefined ||
                typeof status.customMessage === "string") &&
            typeof status.lastSeenAt === "string"
        );
    })();

    return (
        typeof candidate.userId === "string" &&
        (candidate.bio === undefined || typeof candidate.bio === "string") &&
        (candidate.displayName === undefined ||
            typeof candidate.displayName === "string") &&
        (candidate.pronouns === undefined ||
            typeof candidate.pronouns === "string") &&
        (candidate.location === undefined ||
            typeof candidate.location === "string") &&
        (candidate.website === undefined ||
            typeof candidate.website === "string") &&
        (candidate.avatarFileId === undefined ||
            typeof candidate.avatarFileId === "string") &&
        (candidate.avatarUrl === undefined ||
            typeof candidate.avatarUrl === "string") &&
        (candidate.profileBackgroundColor === undefined ||
            typeof candidate.profileBackgroundColor === "string") &&
        (candidate.profileBackgroundGradient === undefined ||
            typeof candidate.profileBackgroundGradient === "string") &&
        (candidate.profileBackgroundImageFileId === undefined ||
            typeof candidate.profileBackgroundImageFileId === "string") &&
        (candidate.profileBackgroundUrl === undefined ||
            typeof candidate.profileBackgroundUrl === "string") &&
        (candidate.avatarFramePreset === undefined ||
            typeof candidate.avatarFramePreset === "string") &&
        (candidate.avatarFrameUrl === undefined ||
            typeof candidate.avatarFrameUrl === "string") &&
        hasValidStatus
    );
}

function getStatusColor(
    status: NonNullable<UserProfile["status"]>["status"],
): string {
    switch (status) {
        case "online":
            return "bg-green-500";
        case "away":
            return "bg-yellow-500";
        case "busy":
            return "bg-red-500";
        default:
            return "bg-gray-400";
    }
}

function getSafeUrl(candidateUrl: string | undefined): string | null {
    if (!candidateUrl) {
        return null;
    }

    try {
        const parsed = new URL(candidateUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.toString();
        }
    } catch {
        return null;
    }

    return null;
}

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

        let cancelled = false;

        const fetchProfile = async () => {
            setLoading(true);
            setError(null);

            const cached = profilePrefetchPool.getCachedProfile(userId);
            if (cached && isUserProfile(cached) && cached.userId === userId) {
                if (cancelled) {
                    return;
                }
                setProfile(cached);
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/users/${userId}/profile`);

                if (!response.ok) {
                    throw new Error("Failed to fetch profile");
                }

                const data: unknown = await response.json();
                if (cancelled) {
                    return;
                }

                if (!isUserProfile(data)) {
                    logger.error(
                        "Invalid profile response payload",
                        "Response failed UserProfile guard",
                        { userId },
                    );
                    setError("Unable to load profile");
                    setProfile(null);
                    return;
                }

                setProfile(data);
            } catch {
                if (cancelled) {
                    return;
                }
                setError("Unable to load profile");
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        const profileTask = fetchProfile();
        profileTask.catch(() => {
            // fetchProfile already handles errors and state updates.
        });

        return () => {
            cancelled = true;
        };
    }, [userId, open]);

    const displayName =
        profile?.displayName ||
        initialDisplayName ||
        userName ||
        "Unknown User";
    const safeWebsiteUrl = getSafeUrl(profile?.website);
    const avatarUrl = profile?.avatarUrl || initialAvatarUrl;

    const cardStyle = getProfileBackgroundStyle({
        backgroundUrl: profile?.profileBackgroundUrl,
        gradient: profile?.profileBackgroundGradient,
        color: profile?.profileBackgroundColor,
    });

    const hasBackground = cardStyle !== undefined;

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
                            className={
                                hasBackground
                                    ? "relative z-10 space-y-4 p-6"
                                    : "relative space-y-4 p-6"
                            }
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
                                                    className={`inline-block size-2 rounded-full ${getStatusColor(profile.status.status)}`}
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
                                        <h4 className="font-bold text-sm">
                                            About:
                                        </h4>
                                        <p className="whitespace-pre-wrap text-foreground text-sm">
                                            {profile.bio}
                                        </p>
                                    </div>
                                )}

                                {/* Additional Info */}
                                {(profile?.location || profile?.website) && (
                                    <div className="space-y-2 pt-2">
                                        <h4 className="font-bold text-sm">
                                            Information:
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
                                            {safeWebsiteUrl && (
                                                <div className="flex gap-2">
                                                    <span className="text-foreground/80">
                                                        Website:
                                                    </span>
                                                    <a
                                                        className="text-primary hover:underline"
                                                        href={safeWebsiteUrl}
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
                                                relationship?.canSendDirectMessage ===
                                                    false
                                            }
                                            onClick={() => {
                                                const task = handleStartDM();
                                                task.catch(() => {
                                                    // handleStartDM already handles errors.
                                                });
                                            }}
                                            type="button"
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
                                    {userData?.userId &&
                                        userData.userId !== userId && (
                                            <ReportUserDialog
                                                fullWidth
                                                targetDisplayName={displayName}
                                                targetUserId={userId}
                                                variant="outline"
                                            />
                                        )}
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
