"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellOff, Volume2, VolumeX, AtSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { MuteDuration, NotificationLevel } from "@/lib/types";

type MuteTargetType = "server" | "channel" | "conversation";

interface MuteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	targetType: MuteTargetType;
	targetId: string;
	targetName: string;
	onMuteComplete?: () => void;
}

interface DurationOption {
	value: MuteDuration;
	label: string;
}

const DURATION_OPTIONS: DurationOption[] = [
	{ value: "15m", label: "15 minutes" },
	{ value: "1h", label: "1 hour" },
	{ value: "8h", label: "8 hours" },
	{ value: "24h", label: "24 hours" },
	{ value: "forever", label: "Until I unmute" },
];

interface NotificationLevelOption {
	value: NotificationLevel;
	label: string;
	description: string;
	icon: React.ReactNode;
}

const LEVEL_OPTIONS: NotificationLevelOption[] = [
	{
		value: "nothing",
		label: "Mute all",
		description: "No notifications at all",
		icon: <VolumeX className="h-4 w-4" />,
	},
	{
		value: "mentions",
		label: "Only @mentions",
		description: "Only notify when you're mentioned",
		icon: <AtSign className="h-4 w-4" />,
	},
	{
		value: "all",
		label: "All messages",
		description: "Get notified for every message",
		icon: <Volume2 className="h-4 w-4" />,
	},
];

function getApiEndpoint(targetType: MuteTargetType, targetId: string): string {
	switch (targetType) {
		case "server":
			return `/api/servers/${targetId}/mute`;
		case "channel":
			return `/api/channels/${targetId}/mute`;
		case "conversation":
			return `/api/conversations/${targetId}/mute`;
	}
}

function getTargetTypeLabel(targetType: MuteTargetType): string {
	switch (targetType) {
		case "server":
			return "server";
		case "channel":
			return "channel";
		case "conversation":
			return "conversation";
	}
}

export function MuteDialog({
	open,
	onOpenChange,
	targetType,
	targetId,
	targetName,
	onMuteComplete,
}: MuteDialogProps) {
	const [selectedDuration, setSelectedDuration] = useState<MuteDuration>("forever");
	const [selectedLevel, setSelectedLevel] = useState<NotificationLevel>("nothing");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleMute = async () => {
		setIsSubmitting(true);
		try {
			const response = await fetch(getApiEndpoint(targetType, targetId), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					muted: true,
					duration: selectedDuration,
					level: selectedLevel,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to mute");
			}

			toast.success(`Muted ${targetName}`);
			onOpenChange(false);
			onMuteComplete?.();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to mute"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleUnmute = async () => {
		setIsSubmitting(true);
		try {
			const response = await fetch(getApiEndpoint(targetType, targetId), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					muted: false,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to unmute");
			}

			toast.success(`Unmuted ${targetName}`);
			onOpenChange(false);
			onMuteComplete?.();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to unmute"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<BellOff className="h-5 w-5" />
						Mute {getTargetTypeLabel(targetType)}
					</DialogTitle>
					<DialogDescription>
						Choose how long to mute{" "}
						<span className="font-medium text-foreground">{targetName}</span> and
						what notifications to suppress.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					{/* Duration Selection */}
					<div className="space-y-2">
						<Label>Mute for</Label>
						<div className="grid gap-2">
							{DURATION_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setSelectedDuration(option.value)}
									className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted ${
										selectedDuration === option.value
											? "border-primary bg-primary/5"
											: "border-border"
									}`}
								>
									<div
										className={`h-4 w-4 rounded-full border-2 ${
											selectedDuration === option.value
												? "border-primary bg-primary"
												: "border-muted-foreground"
										}`}
									/>
									<span className="text-sm font-medium">{option.label}</span>
								</button>
							))}
						</div>
					</div>

					{/* Notification Level Selection */}
					<div className="space-y-2">
						<Label>Notification level</Label>
						<div className="grid gap-2">
							{LEVEL_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setSelectedLevel(option.value)}
									className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted ${
										selectedLevel === option.value
											? "border-primary bg-primary/5"
											: "border-border"
									}`}
								>
									<div
										className={`flex h-8 w-8 items-center justify-center rounded-md ${
											selectedLevel === option.value
												? "bg-primary text-primary-foreground"
												: "bg-muted"
										}`}
									>
										{option.icon}
									</div>
									<div className="flex-1">
										<span className="text-sm font-medium">{option.label}</span>
										<p className="text-xs text-muted-foreground">
											{option.description}
										</p>
									</div>
								</button>
							))}
						</div>
					</div>
				</div>

				<DialogFooter className="flex-col gap-2 sm:flex-row">
					<Button
						variant="outline"
						onClick={handleUnmute}
						disabled={isSubmitting}
						className="w-full sm:w-auto"
					>
						Unmute
					</Button>
					<Button
						onClick={handleMute}
						disabled={isSubmitting}
						className="w-full sm:w-auto"
					>
						{isSubmitting ? "Saving..." : "Mute"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
