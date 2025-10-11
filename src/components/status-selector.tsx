"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
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
	) => Promise<void>;
	children?: React.ReactNode;
};

const statuses: Array<"online" | "away" | "busy" | "offline"> = [
	"online",
	"away",
	"busy",
	"offline",
];

export function StatusSelector({
	currentStatus,
	currentMessage,
	onStatusChange,
	children,
}: StatusSelectorProps) {
	const [customMessage, setCustomMessage] = useState(currentMessage || "");
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const handleStatusChange = async (
		status: "online" | "away" | "busy" | "offline",
	) => {
		setLoading(true);
		try {
			await onStatusChange(status, customMessage || undefined);
		} finally {
			setLoading(false);
		}
	};

	const handleMessageSave = async () => {
		setLoading(true);
		try {
			await onStatusChange(currentStatus, customMessage || undefined);
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
				<div className="space-y-2 p-2">
					<Input
						onChange={(e) => setCustomMessage(e.target.value)}
						placeholder="Set a custom status message..."
						value={customMessage}
					/>
					<Button
						className="w-full"
						disabled={loading}
						onClick={() => void handleMessageSave()}
						size="sm"
						variant="outline"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save Message"
						)}
					</Button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
