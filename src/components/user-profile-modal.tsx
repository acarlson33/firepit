"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrCreateConversation } from "@/lib/appwrite-dms-client";
import { toast } from "sonner";

type UserProfile = {
	userId: string;
	displayName?: string;
	bio?: string;
	pronouns?: string;
	location?: string;
	website?: string;
	avatarFileId?: string;
	avatarUrl?: string;
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

	useEffect(() => {
		if (!open) {
			return;
		}

		const fetchProfile = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(`/api/users/${userId}/profile`);

				if (!response.ok) {
					throw new Error("Failed to fetch profile");
				}

				const data = (await response.json()) as UserProfile;
				setProfile(data);
			} catch (err) {
				// Error already handled by setting error state
				setError("Unable to load profile");
			} finally {
				setLoading(false);
			}
		};

		void fetchProfile();
	}, [userId, open]);

	const displayName = profile?.displayName || initialDisplayName || userName || "Unknown User";
	const avatarUrl = profile?.avatarUrl || initialAvatarUrl;

	async function handleStartDM() {
		if (!onStartDM) {
			return;
		}
		
		setStartingDM(true);
		try {
			// Get current user ID from /api/me
			const meResponse = await fetch("/api/me");
			if (!meResponse.ok) {
				throw new Error("Not authenticated");
			}
			const { userId: currentUserId } = await meResponse.json();

			const conversation = await getOrCreateConversation(currentUserId, userId);
			onStartDM(conversation.$id);
			toast.success(`Started conversation with ${displayName}`);
		} catch (err) {
			toast.error("Failed to start conversation");
		} finally {
			setStartingDM(false);
		}
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>User Profile</DialogTitle>
				</DialogHeader>

				{loading ? (
					<div className="space-y-4">
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
					<div className="space-y-4">
						{/* Avatar and Name */}
						<div className="flex items-center gap-4">
							<div className="relative size-20 overflow-hidden rounded-full border-2 border-border bg-muted">
								{avatarUrl ? (
									<Image
										alt={displayName}
										className="object-cover"
										fill
										sizes="80px"
										src={avatarUrl}
									/>
								) : (
									<div className="flex size-full items-center justify-center text-2xl font-semibold text-muted-foreground">
										{displayName[0]?.toUpperCase() ?? "?"}
									</div>
								)}
							</div>
							<div className="flex-1">
								<h3 className="font-semibold text-lg">{displayName}</h3>
								{profile?.pronouns && (
									<p className="text-muted-foreground text-sm">
										{profile.pronouns}
									</p>
								)}
								{profile?.status && (
									<div className="mt-1 flex items-center gap-2 text-sm">
										<span
											className={`inline-block size-2 rounded-full ${
												profile.status.status === "online"
													? "bg-green-500"
													: profile.status.status === "away"
														? "bg-yellow-500"
														: profile.status.status === "busy"
															? "bg-red-500"
															: "bg-gray-400"
											}`}
										/>
										<span className="capitalize text-muted-foreground">
											{profile.status.status}
										</span>
										{profile.status.customMessage && (
											<span className="text-muted-foreground">
												- {profile.status.customMessage}
											</span>
										)}
									</div>
								)}
							</div>
						</div>

						{/* Bio */}
						{profile?.bio && (
							<div className="space-y-2">
								<h4 className="font-medium text-sm">About</h4>
								<p className="whitespace-pre-wrap text-muted-foreground text-sm">
									{profile.bio}
								</p>
							</div>
						)}

						{/* Additional Info */}
						{(profile?.location || profile?.website) && (
							<div className="space-y-2">
								<h4 className="font-medium text-sm">Information</h4>
								<div className="space-y-1 text-sm">
									{profile.location && (
										<div className="flex gap-2">
											<span className="text-muted-foreground">Location:</span>
											<span>{profile.location}</span>
										</div>
									)}
									{profile.website && (
										<div className="flex gap-2">
											<span className="text-muted-foreground">Website:</span>
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
									disabled={startingDM}
									onClick={() => void handleStartDM()}
									variant="default"
								>
									<MessageSquare className="mr-2 h-4 w-4" />
									{startingDM ? "Starting..." : "Send Direct Message"}
								</Button>
							)}
							<Button asChild className="w-full" variant="outline">
								<Link href={`/profile/${userId}`}>View Full Profile</Link>
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
