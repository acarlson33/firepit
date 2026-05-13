import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-server";
import {
    getAvatarUrl,
    getProfileBackgroundUrl,
    getOrCreateUserProfile,
} from "@/lib/appwrite-profiles";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    removeAvatarAction,
    updateProfileAction,
    uploadAvatarAction,
    updateProfileBackgroundAction,
    uploadProfileBackgroundAction,
    removeProfileBackgroundAction,
    getBackgroundCooldownAction,
    setAvatarFramePresetAction,
    getAvailableFramesAction,
} from "./actions";
import { AvatarUpload } from "./AvatarUpload";
import { ProfileAppearanceSettings } from "@/components/profile-appearance-settings";
import { BlockedUsersSettings } from "@/components/blocked-users-settings";
import { DeveloperModeSettings } from "@/components/developer-mode-settings";
import { FriendsSettings } from "@/components/friends-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { PendingFriendRequestsBadge } from "@/components/pending-friend-requests-badge";
import { SettingsSectionNav } from "@/components/settings-section-nav";
import { TelemetrySettings } from "@/components/telemetry-settings";
import { FlushCaches } from "./FlushCaches";

export default async function SettingsPage() {
    const user = await requireAuth().catch(() => {
        redirect("/login");
    });

    if (!user) {
        redirect("/login");
    }

    // Get or create user profile
    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const avatarUrl = profile.avatarFileId
        ? getAvatarUrl(profile.avatarFileId)
        : null;

    const profileBackgroundImageUrl = profile.profileBackgroundImageFileId
        ? getProfileBackgroundUrl(profile.profileBackgroundImageFileId)
        : null;

    const settingsSections = [
        {
            description: "Photo, profile details, and account basics.",
            href: "#profile-picture",
            title: "Profile",
        },
        {
            description: "Backgrounds and avatar frames.",
            href: "#profile-appearance",
            title: "Appearance",
        },
        {
            description: "How and when Firepit reaches you.",
            href: "#notification-preferences",
            title: "Notifications",
        },
        {
            description: "Friends, requests, and social connections.",
            href: "#connections",
            title: "Connections",
        },
        {
            description: "Blocked users and DM boundaries.",
            href: "#privacy-blocking",
            title: "Privacy",
        },
        {
            description: "Optional navigation and interface controls.",
            href: "#interface",
            title: "Interface",
        },
        {
            description: "Cache and notification recovery tools.",
            href: "#troubleshooting",
            title: "Troubleshooting",
        },
    ] as const;

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8">
                <section className="grid gap-6 overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Account control
                        </div>
                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Personalize your Firepit profile.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Manage how others see you, keep details current,
                                and carry your community presence across every
                                server.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="rounded-full shadow-lg shadow-primary/15">
                                <Link href="#connections">View connections</Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                                variant="outline"
                            >
                                <Link href="#privacy-blocking">Privacy controls</Link>
                            </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Account ID
                                </p>
                                <p className="mt-2 font-mono text-sm text-foreground">
                                    {user.$id.slice(0, 8)}...
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Email
                                </p>
                                <p className="mt-2 break-all text-sm text-foreground">
                                    {user.email}
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Sections
                                </p>
                                <p className="mt-2 text-sm text-foreground">
                                    Profile, privacy, and interface controls
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Profile snapshot
                        </p>
                        <div className="space-y-3 text-sm text-muted-foreground">
                            <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Current email
                                </p>
                                <p className="mt-1 break-all text-foreground">
                                    {user.email}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Profile status
                                </p>
                                <p className="mt-1 text-foreground">
                                    Personal details, avatar, and connections
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Fast links
                                </p>
                                <p className="mt-1 text-foreground">
                                    Jump to the section navigator on the right.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                    <div className="grid gap-8">
                        <div className="sticky top-24 z-20 xl:hidden">
                            <SettingsSectionNav
                                sections={settingsSections}
                                variant="compact"
                            />
                        </div>

                        <section className="scroll-mt-24" id="profile-picture">
                            <Card className="overflow-hidden rounded-4xl border border-border/60 bg-card/75 shadow-xl backdrop-blur-sm">
                                <CardHeader className="space-y-1">
                                    <CardTitle>Profile picture</CardTitle>
                                    <CardDescription>
                                        Upload an image to help your community
                                        recognize you instantly.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <AvatarUpload
                                        currentAvatarUrl={avatarUrl}
                                        removeAvatarAction={removeAvatarAction}
                                        uploadAvatarAction={uploadAvatarAction}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Tip: square images at 512px or larger
                                        look best across the app.
                                    </p>
                                </CardContent>
                            </Card>
                        </section>

                        <section
                            className="scroll-mt-24"
                            id="profile-information"
                        >
                            <form
                                action={updateProfileAction}
                                className="space-y-4"
                            >
                                <Card className="rounded-4xl border border-border/60 bg-card/75 shadow-xl backdrop-blur-sm">
                                    <CardHeader className="space-y-1">
                                        <CardTitle>
                                            Profile information
                                        </CardTitle>
                                        <CardDescription>
                                            Share a bit more about yourself with
                                            every conversation partner.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid gap-6 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="displayName">
                                                Display name
                                            </Label>
                                            <Input
                                                className="rounded-2xl border-border/60"
                                                defaultValue={
                                                    profile.displayName ?? ""
                                                }
                                                id="displayName"
                                                name="displayName"
                                                placeholder="Enter your display name"
                                                type="text"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                This is how others will see your
                                                name.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="pronouns">
                                                Pronouns
                                            </Label>
                                            <Input
                                                className="rounded-2xl border-border/60"
                                                defaultValue={
                                                    profile.pronouns ?? ""
                                                }
                                                id="pronouns"
                                                name="pronouns"
                                                placeholder="e.g., she/her, he/him, they/them"
                                                type="text"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Let others know how you would
                                                like to be addressed.
                                            </p>
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <Label htmlFor="bio">Bio</Label>
                                            <textarea
                                                className="bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-30 w-full rounded-2xl border border-border/60 px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                defaultValue={profile.bio ?? ""}
                                                id="bio"
                                                name="bio"
                                                placeholder="Tell us about yourself..."
                                                rows={5}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Share interests, roles, or
                                                anything that helps others
                                                connect.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="location">
                                                Location
                                            </Label>
                                            <Input
                                                className="rounded-2xl border-border/60"
                                                defaultValue={
                                                    profile.location ?? ""
                                                }
                                                id="location"
                                                name="location"
                                                placeholder="e.g., San Francisco, CA"
                                                type="text"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="website">
                                                Website
                                            </Label>
                                            <Input
                                                className="rounded-2xl border-border/60"
                                                defaultValue={
                                                    profile.website ?? ""
                                                }
                                                id="website"
                                                name="website"
                                                placeholder="https://example.com"
                                                type="url"
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end">
                                        <Button
                                            className="w-full rounded-2xl sm:w-auto"
                                            type="submit"
                                        >
                                            Save changes
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </form>
                        </section>

                        <section
                            className="scroll-mt-24"
                            id="profile-appearance"
                        >
                            <Card className="rounded-4xl border border-border/60 bg-card/75 shadow-xl backdrop-blur-sm">
                                <CardHeader className="space-y-1">
                                    <CardTitle>Profile Appearance</CardTitle>
                                    <CardDescription>
                                        Customize your profile background and
                                        avatar frame to express your
                                        personality.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ProfileAppearanceSettings
                                        avatarFramePreset={
                                            profile.avatarFramePreset
                                        }
                                        currentAvatarUrl={
                                            avatarUrl ?? undefined
                                        }
                                        getAvailableFrames={
                                            getAvailableFramesAction
                                        }
                                        getBackgroundCooldown={
                                            getBackgroundCooldownAction
                                        }
                                        profileBackgroundColor={
                                            profile.profileBackgroundColor
                                        }
                                        profileBackgroundGradient={
                                            profile.profileBackgroundGradient
                                        }
                                        profileBackgroundImageFileId={
                                            profile.profileBackgroundImageFileId
                                        }
                                        profileBackgroundImageUrl={
                                            profileBackgroundImageUrl ??
                                            undefined
                                        }
                                        removeBackgroundAction={
                                            removeProfileBackgroundAction
                                        }
                                        setFramePresetAction={
                                            setAvatarFramePresetAction
                                        }
                                        updateBackgroundAction={
                                            updateProfileBackgroundAction
                                        }
                                        uploadBackgroundAction={
                                            uploadProfileBackgroundAction
                                        }
                                    />
                                </CardContent>
                            </Card>
                        </section>

                        <section
                            className="scroll-mt-24"
                            id="account-information"
                        >
                            <Card className="rounded-4xl border border-border/60 bg-card/75 shadow-xl backdrop-blur-sm">
                                <CardHeader className="space-y-1">
                                    <CardTitle>Account information</CardTitle>
                                    <CardDescription>
                                        Your core account details are read-only
                                        for safety.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Email
                                        </p>
                                        <p className="mt-2 break-all text-sm text-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Account name
                                        </p>
                                        <p className="mt-2 text-sm text-foreground">
                                            {user.name}
                                        </p>
                                    </div>
                                    <div className="md:col-span-2 rounded-2xl border border-border/60 bg-background/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            User ID
                                        </p>
                                        <p className="mt-2 break-all font-mono text-xs text-foreground">
                                            {user.$id}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section
                            className="scroll-mt-24 overflow-hidden rounded-4xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-10"
                            id="notification-preferences"
                        >
                            <div className="mb-6 space-y-3">
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Notification preferences
                                </h2>
                                <p className="text-muted-foreground">
                                    Manage how and when you receive
                                    notifications from firepit.
                                </p>
                            </div>
                            <NotificationSettings />
                        </section>

                        <section
                            className="scroll-mt-24 overflow-hidden rounded-4xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-10"
                            id="connections"
                        >
                            <div className="mb-6 space-y-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-2xl font-semibold tracking-tight">
                                        Connections
                                    </h2>
                                    <PendingFriendRequestsBadge />
                                </div>
                                <p className="text-muted-foreground">
                                    Manage friends and pending requests from one
                                    place.
                                </p>
                            </div>
                            <FriendsSettings />
                        </section>

                        <section
                            className="scroll-mt-24 overflow-hidden rounded-4xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-10"
                            id="privacy-blocking"
                        >
                            <div className="mb-6 space-y-3">
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Privacy & Blocking
                                </h2>
                                <p className="text-muted-foreground">
                                    Manage your telemetry preference and review
                                    blocked users to keep your messaging
                                    boundaries current.
                                </p>
                            </div>
                            <div className="mb-6">
                                <TelemetrySettings />
                            </div>
                            <BlockedUsersSettings />
                        </section>

                        <section
                            className="scroll-mt-24 overflow-hidden rounded-4xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-10"
                            id="interface"
                        >
                            <div className="mb-6 space-y-3">
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Interface
                                </h2>
                                <p className="text-muted-foreground">
                                    Control optional navigation items and keep
                                    your main workspace focused on what you use
                                    most.
                                </p>
                            </div>
                            <DeveloperModeSettings />
                        </section>

                        <section
                            className="scroll-mt-24 overflow-hidden rounded-4xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm sm:p-10"
                            id="troubleshooting"
                        >
                            <div className="mb-6 space-y-3">
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Troubleshooting
                                </h2>
                                <p className="text-muted-foreground">
                                    Flush cached assets and unregister service
                                    workers if you are seeing stale data or
                                    notification issues.
                                </p>
                            </div>
                            <FlushCaches />
                        </section>
                    </div>

                    <aside className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
                        <SettingsSectionNav sections={settingsSections} />
                    </aside>
                </div>
            </div>
        </div>
    );
}
