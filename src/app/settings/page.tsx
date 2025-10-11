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
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="grid gap-8">
				{/* Header */}
				<section>
					<h1 className="text-3xl font-bold tracking-tight">Settings</h1>
					<p className="text-muted-foreground mt-2">
						Manage your account settings and profile information
					</p>
				</section>

				{/* Profile Picture */}
				<Card>
					<CardHeader>
						<CardTitle>Profile Picture</CardTitle>
						<CardDescription>
							Upload a profile picture to personalize your account
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<AvatarUpload
							currentAvatarUrl={avatarUrl}
							removeAvatarAction={removeAvatarAction}
							uploadAvatarAction={uploadAvatarAction}
						/>
					</CardContent>
				</Card>

				{/* Profile Information */}
				<form action={updateProfileAction}>
					<Card>
						<CardHeader>
							<CardTitle>Profile Information</CardTitle>
							<CardDescription>
								Update your personal information and bio
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="displayName">Display Name</Label>
								<Input
									defaultValue={profile.displayName ?? ""}
									id="displayName"
									name="displayName"
									placeholder="Enter your display name"
									type="text"
								/>
								<p className="text-muted-foreground text-xs">
									This is how others will see your name
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="pronouns">Pronouns</Label>
								<Input
									defaultValue={profile.pronouns ?? ""}
									id="pronouns"
									name="pronouns"
									placeholder="e.g., she/her, he/him, they/them"
									type="text"
								/>
								<p className="text-muted-foreground text-xs">
									Help others address you correctly
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="bio">Bio</Label>
								<textarea
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
									defaultValue={profile.bio ?? ""}
									id="bio"
									name="bio"
									placeholder="Tell us about yourself..."
									rows={4}
								/>
								<p className="text-muted-foreground text-xs">
									Brief description for your profile
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="location">Location</Label>
								<Input
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
									defaultValue={profile.website ?? ""}
									id="website"
									name="website"
									placeholder="https://example.com"
									type="url"
								/>
							</div>
						</CardContent>
						<CardFooter>
							<Button className="w-full" type="submit">
								Save Changes
							</Button>
						</CardFooter>
					</Card>
				</form>

				{/* Account Information */}
				<Card>
					<CardHeader>
						<CardTitle>Account Information</CardTitle>
						<CardDescription>Your account details (read-only)</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-[120px_1fr] gap-4 text-sm">
							<span className="text-muted-foreground font-medium">Email:</span>
							<span>{user.email}</span>
							<span className="text-muted-foreground font-medium">
								Account Name:
							</span>
							<span>{user.name}</span>
							<span className="text-muted-foreground font-medium">
								User ID:
							</span>
							<span className="font-mono text-xs">{user.$id}</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
