"use client";

import { cn } from "@/lib/utils";

type StatusIndicatorProps = {
	status: "online" | "away" | "busy" | "offline";
	size?: "sm" | "md" | "lg";
	showLabel?: boolean;
	className?: string;
};

const statusColors = {
	online: "bg-green-500",
	away: "bg-yellow-500",
	busy: "bg-red-500",
	offline: "bg-gray-400",
};

const statusLabels = {
	online: "Online",
	away: "Away",
	busy: "Busy",
	offline: "Offline",
};

const sizes = {
	sm: "size-2",
	md: "size-3",
	lg: "size-4",
};

export function StatusIndicator({
	status,
	size = "md",
	showLabel = false,
	className,
}: StatusIndicatorProps) {
	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			<span
				className={cn(
					"rounded-full",
					statusColors[status],
					sizes[size],
					status === "online" && "animate-pulse",
				)}
				title={statusLabels[status]}
			/>
			{showLabel && (
				<span className="text-muted-foreground text-sm">
					{statusLabels[status]}
				</span>
			)}
		</div>
	);
}
