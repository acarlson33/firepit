"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { Role, Permission } from "@/lib/types";
import { getAllPermissions, getPermissionDescription } from "@/lib/permissions";

type RoleEditorProperties = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role: Role | null;
	serverId: string;
	onSave: (role: Partial<Role>) => Promise<void>;
};

export function RoleEditor({
	open,
	onOpenChange,
	role,
	serverId,
	onSave,
}: RoleEditorProperties) {
	const [name, setName] = useState("");
	const [color, setColor] = useState("#5865F2");
	const [position, setPosition] = useState(0);
	const [mentionable, setMentionable] = useState(true);
	const [permissions, setPermissions] = useState<Record<Permission, boolean>>({
		readMessages: true,
		sendMessages: true,
		manageMessages: false,
		manageChannels: false,
		manageRoles: false,
		manageServer: false,
		mentionEveryone: false,
		administrator: false,
	});
	const [saving, setSaving] = useState(false);

	// Populate form when role changes
	useEffect(() => {
		if (role) {
			setName(role.name);
			setColor(role.color);
			setPosition(role.position);
			setMentionable(role.mentionable);
			setPermissions({
				readMessages: role.readMessages,
				sendMessages: role.sendMessages,
				manageMessages: role.manageMessages,
				manageChannels: role.manageChannels,
				manageRoles: role.manageRoles,
				manageServer: role.manageServer,
				mentionEveryone: role.mentionEveryone,
				administrator: role.administrator,
			});
		} else {
			// Reset form for new role
			setName("");
			setColor("#5865F2");
			setPosition(0);
			setMentionable(true);
			setPermissions({
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
			});
		}
	}, [role]);

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Role name is required");
			return;
		}

		setSaving(true);
		try {
			const roleData: Partial<Role> = {
				...(role?.$id && { $id: role.$id }),
				serverId,
				name: name.trim(),
				color,
				position,
				mentionable,
				...permissions,
			};

			await onSave(roleData);
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to save role:", error);
			toast.error(error instanceof Error ? error.message : "Failed to save role");
		} finally {
			setSaving(false);
		}
	};

	const togglePermission = (permission: Permission) => {
		setPermissions((previous) => ({
			...previous,
			[permission]: !previous[permission],
		}));
	};

	const allPermissions = getAllPermissions();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>
						{role ? `Edit Role: ${role.name}` : "Create New Role"}
					</DialogTitle>
					<DialogDescription>
						{role
							? "Modify role settings and permissions"
							: "Create a new role with custom permissions"}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Basic Settings */}
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="role-name">Role Name</Label>
							<Input
								id="role-name"
								placeholder="Moderator"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="role-color">Color</Label>
								<div className="flex gap-2">
									<Input
										id="role-color"
										type="color"
										value={color}
										onChange={(event) => setColor(event.target.value)}
										className="h-10 w-20"
									/>
									<Input
										type="text"
										value={color}
										onChange={(event) => setColor(event.target.value)}
										placeholder="#5865F2"
										className="flex-1"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="role-position">Position</Label>
								<Input
									id="role-position"
									type="number"
									min="0"
									max="999"
									value={position}
									onChange={(event) => setPosition(Number.parseInt(event.target.value, 10))}
								/>
								<p className="text-xs text-muted-foreground">
									Higher = more priority
								</p>
							</div>
						</div>

						<div className="flex items-center justify-between rounded-lg border border-border p-3">
							<div className="space-y-0.5">
								<Label htmlFor="mentionable">Mentionable</Label>
								<p className="text-xs text-muted-foreground">
									Allow anyone to @mention this role
								</p>
							</div>
							<Switch
								id="mentionable"
								checked={mentionable}
								onCheckedChange={setMentionable}
							/>
						</div>
					</div>

					{/* Permissions */}
					<div className="space-y-3">
						<div>
							<h4 className="font-medium">Permissions</h4>
							<p className="text-sm text-muted-foreground">
								Configure what this role can do
							</p>
						</div>

						<div className="space-y-2">
							{allPermissions.map((permission) => (
								<div
									key={permission}
									className="flex items-center justify-between rounded-lg border border-border p-3"
								>
									<div className="space-y-0.5">
										<Label htmlFor={`permission-${permission}`} className="capitalize">
											{permission.replace(/([A-Z])/g, " $1").trim()}
										</Label>
										<p className="text-xs text-muted-foreground">
											{getPermissionDescription(permission)}
										</p>
									</div>
									<Switch
										id={`permission-${permission}`}
										checked={permissions[permission]}
										onCheckedChange={() => togglePermission(permission)}
									/>
								</div>
							))}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving..." : role ? "Save Changes" : "Create Role"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
