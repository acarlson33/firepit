import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCachedUserProfile, getCachedAvatarUrl } from "@/lib/cached-data";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StartDMButton } from "./start-dm-button";

type Props = {
	params: Promise<{ userId: string }>;
};

export default async function ProfilePage({ params }: Props) {
	const { userId } = await params;

	// Get user profile (cached)
	const profile = await getCachedUserProfile(userId);

	if (!profile) {
		notFound();
	}

	// Get user roles
	const roles = await getUserRoleTags(userId);

	const avatarUrl = profile.avatarFileId
		? await getCachedAvatarUrl(profile.avatarFileId)
		: null;

	const roleLabel = roles.isAdmin
		? "Administrator"
		: roles.isModerator
			? "Moderator"
			: "Member";

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="grid gap-8">
				{/* Header with Avatar */}
				<Card>
					<CardContent className="pt-6">
						<div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
							{/* Avatar */}
							<div className="relative size-32 overflow-hidden rounded-full border-2 border-border bg-muted">
								{avatarUrl ? (
									<Image
										alt={profile.displayName ?? "Profile picture"}
										className="object-cover"
										fill
										priority
										sizes="128px"
										src={avatarUrl}
									/>
								) : (
									<div className="flex size-full items-center justify-center text-5xl font-semibold text-muted-foreground">
										{profile.displayName?.[0]?.toUpperCase() ?? "?"}
									</div>
								)}
							</div>

							{/* Name and Role */}
							<div className="flex-1 space-y-2 text-center sm:text-left">
								<h1 className="text-3xl font-bold">
									{profile.displayName ?? "Anonymous User"}
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

						{/* Action Buttons */}
						<div className="mt-4 flex justify-center gap-2 sm:justify-start">
							<StartDMButton
								displayName={profile.displayName ?? "this user"}
								targetUserId={userId}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Bio */}
				{profile.bio && (
					<Card>
						<CardHeader>
							<CardTitle>About</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="whitespace-pre-wrap text-sm">{profile.bio}</p>
						</CardContent>
					</Card>
				)}

				{/* Additional Information */}
				<Card>
					<CardHeader>
						<CardTitle>Information</CardTitle>
						<CardDescription>Public profile details</CardDescription>
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
								<span className="font-mono text-xs">{profile.userId}</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Back to Home */}
				<div className="flex justify-center">
					<Button asChild variant="outline">
						<Link href="/">Back to Home</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
