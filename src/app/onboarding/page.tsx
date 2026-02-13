"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { completeOnboardingAction } from "./actions";

export default function OnboardingPage() {
	const router = useRouter();
	const { userData, refreshUser } = useAuth();
	const [displayName, setDisplayName] = useState("");
	const [bio, setBio] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!displayName.trim()) {
			toast.error("Please enter a display name");
			return;
		}

		setLoading(true);
		try {
			const formData = new FormData();
			formData.set("displayName", displayName);
			formData.set("bio", bio);

			const result = await completeOnboardingAction(formData);

			if (result.success) {
				toast.success("Profile setup complete!");
				await refreshUser();
				router.push("/chat");
			} else {
				toast.error(result.error);
			}
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "An error occurred. Please try again.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	function handleSkip() {
		router.push("/chat");
	}

	return (
		<div className="container mx-auto max-w-2xl px-4 py-12">
			<div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur">
				<div className="mb-8 space-y-4 text-center">
					<div className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/60 via-purple-400/60 to-transparent p-3 shadow-lg">
						<Sparkles className="size-8 text-primary" />
					</div>
					<h1 className="font-semibold text-3xl tracking-tight">
						Welcome to Firepit!
					</h1>
					<p className="text-muted-foreground">
						Let's set up your profile so others can get to know you better.
					</p>
					{userData?.name && (
						<p className="text-sm text-muted-foreground">
							Logged in as <span className="font-medium">{userData.name}</span>
						</p>
					)}
				</div>

				<form className="space-y-6" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="displayName">Display Name *</Label>
						<Input
							autoComplete="name"
							id="displayName"
							name="displayName"
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="How should others see your name?"
							required
							type="text"
							value={displayName}
						/>
						<p className="text-xs text-muted-foreground">
							This is how you'll appear in conversations and on your profile.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="bio">About You</Label>
						<Textarea
							id="bio"
							name="bio"
							onChange={(e) => setBio(e.target.value)}
							placeholder="Tell us a bit about yourself..."
							rows={4}
							value={bio}
						/>
						<p className="text-xs text-muted-foreground">
							Share your interests, what you do, or anything that helps others
							connect with you. (Optional)
						</p>
					</div>

					<div className="flex flex-col gap-3 pt-4 sm:flex-row">
						<Button className="flex-1" disabled={loading} type="submit">
							{loading ? "Setting up..." : "Complete Setup"}
						</Button>
						<Button
							className="sm:w-auto"
							disabled={loading}
							onClick={handleSkip}
							type="button"
							variant="outline"
						>
							Skip for now
						</Button>
					</div>
				</form>

				<p className="mt-6 text-center text-xs text-muted-foreground">
					You can always update your profile later in Settings.
				</p>
			</div>
		</div>
	);
}
