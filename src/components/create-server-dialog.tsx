"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateServerDialogProps {
	onServerCreated?: () => void;
	trigger?: React.ReactNode;
}

export function CreateServerDialog({
	onServerCreated,
	trigger,
}: CreateServerDialogProps) {
	const [open, setOpen] = useState(false);
	const [serverName, setServerName] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const handleCreate = async () => {
		if (!serverName.trim()) {
			toast.error("Server name is required");
			return;
		}

		setIsCreating(true);
		try {
			const response = await fetch("/api/servers/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: serverName.trim() }),
			});

			const result = await response.json() as { 
				success: boolean; 
				server?: { name: string };
				error?: string;
			};

			if (response.ok && result.success && result.server) {
				toast.success(`Server "${result.server.name}" created successfully!`);
				setServerName("");
				setOpen(false);
				onServerCreated?.();
			} else {
				toast.error(result.error || "Failed to create server");
			}
		} catch (error) {
			console.error("Failed to create server:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to create server"
			);
		} finally {
			setIsCreating(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleCreate();
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button size="sm" variant="ghost" title="Create Server">
						<Plus className="h-4 w-4" />
					</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create New Server</DialogTitle>
					<DialogDescription>
						Create your own server to organize channels and chat with others.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="server-name">Server Name</Label>
						<Input
							id="server-name"
							placeholder="My Awesome Server"
							value={serverName}
							onChange={(e) => setServerName(e.target.value)}
							onKeyDown={handleKeyDown}
							disabled={isCreating}
							maxLength={100}
						/>
						<p className="text-xs text-muted-foreground">
							Choose a name that represents your community
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isCreating}
					>
						Cancel
					</Button>
					<Button
						onClick={handleCreate}
						disabled={isCreating || !serverName.trim()}
					>
						{isCreating ? "Creating..." : "Create Server"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
