"use client";

import { useState } from "react";
import { Check, Loader2, Clock } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusIndicator } from "./status-indicator";
import { Button } from "./ui/button";

type StatusSelectorProps = {
	currentStatus: "online" | "away" | "busy" | "offline";
	currentMessage?: string;
	onStatusChange: (
		status: "online" | "away" | "busy" | "offline",
		customMessage?: string,
		expiresAt?: string,
	) => Promise<void>;
	children?: React.ReactNode;
};

const statuses: Array<"online" | "away" | "busy" | "offline"> = [
	"online",
	"away",
	"busy",
	"offline",
];

const expirationOptions = [
	{ label: "Don't clear", value: null },
	{ label: "30 minutes", value: 30 * 60 * 1000 },
	{ label: "1 hour", value: 60 * 60 * 1000 },
	{ label: "2 hours", value: 2 * 60 * 60 * 1000 },
	{ label: "4 hours", value: 4 * 60 * 60 * 1000 },
	{ label: "Today", value: "today" as const },
	{ label: "This week", value: 7 * 24 * 60 * 60 * 1000 },
];

export function StatusSelector({
	currentStatus,
	currentMessage,
	onStatusChange,
	children,
}: StatusSelectorProps) {
	const [customMessage, setCustomMessage] = useState(currentMessage || "");
	const [selectedExpiration, setSelectedExpiration] = useState<number | "today" | null>(null);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const calculateExpiresAt = (
		expiration: number | "today" | null,
	): string | undefined => {
		if (expiration === null) {
			return undefined;
		}

		const now = new Date();

		if (expiration === "today") {
			// Set to end of today (11:59:59 PM)
			const endOfDay = new Date(now);
			endOfDay.setHours(23, 59, 59, 999);
			return endOfDay.toISOString();
		}

		// Add milliseconds to current time
		const expiresAt = new Date(now.getTime() + expiration);
		return expiresAt.toISOString();
	};

	const handleStatusChange = async (
		status: "online" | "away" | "busy" | "offline",
	) => {
		setLoading(true);
		try {
			const expiresAt = calculateExpiresAt(selectedExpiration);
			await onStatusChange(status, customMessage || undefined, expiresAt);
		} finally {
			setLoading(false);
		}
	};

	const handleMessageSave = async () => {
		setLoading(true);
		try {
			const expiresAt = calculateExpiresAt(selectedExpiration);
			await onStatusChange(currentStatus, customMessage || undefined, expiresAt);
			setOpen(false);
		} finally {
			setLoading(false);
		}
	};

	return (
		<DropdownMenu onOpenChange={setOpen} open={open}>
			<DropdownMenuTrigger asChild>
				{children || (
					<button
						className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent"
						type="button"
					>
						<StatusIndicator size="md" status={currentStatus} />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<div className="px-2 py-1.5">
					<p className="font-medium text-sm">Set your status</p>
				</div>
				<DropdownMenuSeparator />
				{statuses.map((status) => (
					<DropdownMenuItem
						disabled={loading}
						key={status}
						onClick={() => void handleStatusChange(status)}
					>
						<div className="flex w-full items-center justify-between">
							<div className="flex items-center gap-2">
								<StatusIndicator showLabel size="sm" status={status} />
							</div>
							{currentStatus === status && <Check className="size-4" />}
						</div>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<div className="space-y-3 p-2">
					<div>
						<label className="mb-1 text-muted-foreground text-xs" htmlFor="status-message">
							Custom message
						</label>
						<Input
							id="status-message"
							onChange={(e) => setCustomMessage(e.target.value)}
							placeholder="What's your status?"
							value={customMessage}
						/>
					</div>

					<div>
						<label className="mb-1 flex items-center gap-1 text-muted-foreground text-xs">
							<Clock className="size-3" />
							Clear status after
						</label>
						<div className="grid grid-cols-2 gap-1">
							{expirationOptions.map((option) => (
								<Button
									key={option.label}
									className="h-auto py-1.5 text-xs"
									onClick={() => setSelectedExpiration(option.value)}
									size="sm"
									type="button"
									variant={
										selectedExpiration === option.value
											? "default"
											: "outline"
									}
								>
									{option.label}
								</Button>
							))}
						</div>
					</div>

					<Button
						className="w-full"
						disabled={loading}
						onClick={() => void handleMessageSave()}
						size="sm"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save Status"
						)}
					</Button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
