import { notFound } from "next/navigation";
import Link from "next/link";
import {
    getCachedUserProfile,
    getCachedAvatarUrl,
    getCachedProfileBackgroundUrl,
    getCachedAvatarFrameUrlForProfile,
} from "@/lib/cached-data";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import { getServerSession } from "@/lib/auth-server";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RelationshipActions } from "@/components/relationship-actions";
import { StartDMButton } from "./start-dm-button";
import { AvatarWithFrame } from "@/components/profile-background";
import { ReportUserDialog } from "@/components/report-user-dialog";

type Props = {
    params: Promise<{ userId: string }>;
};

export default async function ProfilePage({ params }: Props) {
    const { userId } = await params;

    const profile = await getCachedUserProfile(userId);

    if (!profile) {
        notFound();
    }

    const session = await getServerSession();
    const isOwnProfile = session?.$id === userId;

    const roles = await getUserRoleTags(userId);

    const avatarUrl = profile.avatarFileId
        ? await getCachedAvatarUrl(profile.avatarFileId)
        : undefined;

    const profileBackgroundUrl = profile.profileBackgroundImageFileId
        ? await getCachedProfileBackgroundUrl(
              profile.profileBackgroundImageFileId,
          )
        : undefined;

    const avatarFrameUrl = await getCachedAvatarFrameUrlForProfile({
        avatarFramePreset: profile.avatarFramePreset,
    });

    const roleLabel = roles.isAdmin
        ? "Administrator"
        : roles.isModerator
          ? "Moderator"
          : "Member";

    const cardStyle = profileBackgroundUrl
        ? {
              backgroundImage: `url(${profileBackgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
          }
        : profile.profileBackgroundGradient
          ? { background: profile.profileBackgroundGradient }
          : profile.profileBackgroundColor
            ? { background: profile.profileBackgroundColor }
            : undefined;

    const hasBackground = Boolean(cardStyle);

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <div className="grid gap-8">
                <Card style={cardStyle}>
                    {hasBackground && (
                        <div className="absolute inset-0 rounded-lg bg-black/40" />
                    )}
                    <CardContent
                        className={`relative ${hasBackground ? "z-10" : ""} pt-6`}
                    >
                        <div className="rounded-lg bg-black/20 backdrop-blur-sm p-4">
                            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                                <AvatarWithFrame
                                    avatarFramePreset={
                                        profile.avatarFramePreset
                                    }
                                    avatarFrameUrl={avatarFrameUrl}
                                    avatarUrl={avatarUrl}
                                    displayName={profile.displayName ?? "User"}
                                    size="xl"
                                />

                                <div className="flex-1 space-y-2 text-center sm:text-left">
                                    <h1 className="text-3xl font-bold">
                                        {profile.displayName ??
                                            "Anonymous User"}
                                    </h1>
                                    {profile.pronouns && (
                                        <p className="text-muted-foreground text-sm">
                                            {profile.pronouns}
                                        </p>
                                    )}
                                    <p className="text-sm">
                                        <span className="bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">
                                            {roleLabel}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-center gap-2 sm:justify-start">
                                <StartDMButton
                                    displayName={
                                        profile.displayName ?? "this user"
                                    }
                                    targetUserId={userId}
                                />
                                <RelationshipActions
                                    displayName={
                                        profile.displayName ?? "this user"
                                    }
                                    targetUserId={userId}
                                />
                                {!isOwnProfile && (
                                    <ReportUserDialog
                                        targetDisplayName={
                                            profile.displayName ?? "this user"
                                        }
                                        targetUserId={userId}
                                    />
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {profile.bio && (
                    <Card>
                        <CardHeader>
                            <CardTitle>About</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="whitespace-pre-wrap text-sm">
                                {profile.bio}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Information</CardTitle>
                        <CardDescription>
                            Public profile details
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 text-sm">
                            {profile.location && (
                                <div className="grid grid-cols-[120px_1fr] gap-2">
                                    <span className="text-muted-foreground font-medium">
                                        Location:
                                    </span>
                                    <span>{profile.location}</span>
                                </div>
                            )}
                            {profile.website && (
                                <div className="grid grid-cols-[120px_1fr] gap-2">
                                    <span className="text-muted-foreground font-medium">
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
                            <div className="grid grid-cols-[120px_1fr] gap-2">
                                <span className="text-muted-foreground font-medium">
                                    User ID:
                                </span>
                                <span className="font-mono text-xs">
                                    {profile.userId}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-center">
                    <Button asChild variant="outline">
                        <Link href="/">Back to Home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
