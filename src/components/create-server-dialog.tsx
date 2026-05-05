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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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
	const [description, setDescription] = useState("");
	const [isPublic, setIsPublic] = useState(true);
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
				body: JSON.stringify({
					name: serverName.trim(),
					description: description.trim() || undefined,
					isPublic,
				}),
			});

			const result = await response.json() as { 
				success: boolean; 
				server?: { name: string };
				error?: string;
			};

			if (response.ok && result.success && result.server) {
				toast.success(`Server "${result.server.name}" created successfully!`);
				setServerName("");
				setDescription("");
				setIsPublic(true);
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
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setServerName("");
					setDescription("");
					setIsPublic(true);
				}
			}}
		>
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

					<div className="space-y-2">
						<Label htmlFor="server-description">Description</Label>
						<Textarea
							id="server-description"
							placeholder="Tell people what this server is about"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							disabled={isCreating}
							maxLength={500}
						/>
						<p className="text-xs text-muted-foreground">
							Optional. Up to 500 characters.
						</p>
					</div>

					<div className="flex items-start justify-between rounded-md border border-border/60 p-3">
						<div className="space-y-1 pr-4">
							<Label
								className="text-sm font-medium"
								htmlFor="public-discovery-switch"
							>
								Public discovery
							</Label>
							<p className="text-xs text-muted-foreground">
								Public servers appear in discovery and allow direct joins.
								 Private servers require an invite link.
							</p>
						</div>
						<Switch
							checked={isPublic}
							disabled={isCreating}
							id="public-discovery-switch"
							onCheckedChange={setIsPublic}
						/>
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
