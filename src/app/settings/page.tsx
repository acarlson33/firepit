import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-server";
import {
	getAvatarUrl,
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
} from "./actions";
import { AvatarUpload } from "./AvatarUpload";

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

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-10">
			<div className="grid gap-8">
				<section className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur">
					<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
						<div className="space-y-3">
							<h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
								Personalize your firepit profile
							</h1>
							<p className="max-w-xl text-muted-foreground">
								Manage how others see you, keep details current, and carry your community presence across every server.
							</p>
							<div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Account ID
								<span className="font-mono text-[11px] text-foreground">{user.$id.slice(0, 8)}...</span>
							</div>
						</div>
						<div className="rounded-3xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
							<p className="font-semibold text-foreground">Current email</p>
							<p className="mt-1 break-all">{user.email}</p>
						</div>
					</div>
				</section>

				<Card className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-lg">
					<CardHeader className="space-y-1">
						<CardTitle>Profile picture</CardTitle>
						<CardDescription>
							Upload an image to help your community recognize you instantly.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<AvatarUpload
							currentAvatarUrl={avatarUrl}
							removeAvatarAction={removeAvatarAction}
							uploadAvatarAction={uploadAvatarAction}
						/>
						<p className="text-xs text-muted-foreground">
							Tip: square images at 512px or larger look best across the app.
						</p>
					</CardContent>
				</Card>

				<form action={updateProfileAction} className="space-y-4">
					<Card className="rounded-3xl border border-border/60 bg-card/70 shadow-lg">
						<CardHeader className="space-y-1">
							<CardTitle>Profile information</CardTitle>
							<CardDescription>Share a bit more about yourself with every conversation partner.</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-6 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="displayName">Display name</Label>
								<Input
									className="rounded-2xl border-border/60"
									defaultValue={profile.displayName ?? ""}
									id="displayName"
									name="displayName"
									placeholder="Enter your display name"
									type="text"
								/>
								<p className="text-xs text-muted-foreground">
									This is how others will see your name.
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="pronouns">Pronouns</Label>
								<Input
									className="rounded-2xl border-border/60"
									defaultValue={profile.pronouns ?? ""}
									id="pronouns"
									name="pronouns"
									placeholder="e.g., she/her, he/him, they/them"
									type="text"
								/>
								<p className="text-xs text-muted-foreground">
									Let others know how you would like to be addressed.
								</p>
							</div>
							<div className="md:col-span-2 space-y-2">
								<Label htmlFor="bio">Bio</Label>
								<textarea
									className="bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-[120px] w-full rounded-2xl border border-border/60 px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
									defaultValue={profile.bio ?? ""}
									id="bio"
									name="bio"
									placeholder="Tell us about yourself..."
									rows={5}
								/>
								<p className="text-xs text-muted-foreground">
									Share interests, roles, or anything that helps others connect.
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="location">Location</Label>
								<Input
									className="rounded-2xl border-border/60"
									defaultValue={profile.location ?? ""}
									id="location"
									name="location"
									placeholder="e.g., San Francisco, CA"
									type="text"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="website">Website</Label>
								<Input
									className="rounded-2xl border-border/60"
									defaultValue={profile.website ?? ""}
									id="website"
									name="website"
									placeholder="https://example.com"
									type="url"
								/>
							</div>
						</CardContent>
						<CardFooter className="justify-end">
							<Button className="w-full rounded-2xl sm:w-auto" type="submit">
								Save changes
							</Button>
						</CardFooter>
					</Card>
				</form>

				<Card className="rounded-3xl border border-border/60 bg-card/70 shadow-lg">
					<CardHeader className="space-y-1">
						<CardTitle>Account information</CardTitle>
						<CardDescription>Your core account details are read-only for safety.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<div className="rounded-2xl border border-border/60 bg-background/70 p-4">
							<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Email
							</p>
							<p className="mt-2 break-all text-sm text-foreground">{user.email}</p>
						</div>
						<div className="rounded-2xl border border-border/60 bg-background/70 p-4">
							<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Account name
							</p>
							<p className="mt-2 text-sm text-foreground">{user.name}</p>
						</div>
						<div className="md:col-span-2 rounded-2xl border border-border/60 bg-background/70 p-4">
							<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								User ID
							</p>
							<p className="mt-2 break-all font-mono text-xs text-foreground">{user.$id}</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
