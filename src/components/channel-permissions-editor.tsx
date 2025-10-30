"use client";

import { useState, useEffect } from "react";
import { Shield, Plus, Trash2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Role, Permission, ChannelPermissionOverride } from "@/lib/types";
import { getAllPermissions, getPermissionDescription } from "@/lib/permissions";

type ChannelPermissionsEditorProperties = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	channelId: string;
	channelName: string;
	serverId: string;
};

type OverrideType = "role" | "user";

export function ChannelPermissionsEditor({
	open,
	onOpenChange,
	channelId,
	channelName,
	serverId,
}: ChannelPermissionsEditorProperties) {
	const [overrides, setOverrides] = useState<ChannelPermissionOverride[]>([]);
	const [roles, setRoles] = useState<Role[]>([]);
	const [loading, setLoading] = useState(false);
	const [editingOverride, setEditingOverride] = useState<ChannelPermissionOverride | null>(null);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [createType, setCreateType] = useState<OverrideType>("role");
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [selectedUserId, setSelectedUserId] = useState<string>("");
	const [allowPermissions, setAllowPermissions] = useState<Set<Permission>>(new Set());
	const [denyPermissions, setDenyPermissions] = useState<Set<Permission>>(new Set());

	useEffect(() => {
		if (open) {
			void loadOverrides();
			void loadRoles();
		}
	}, [open, channelId]);

	const loadOverrides = async () => {
		setLoading(true);
		try {
			const response = await fetch(`/api/channel-permissions?channelId=${channelId}`);
			if (response.ok) {
				const data = await response.json();
				setOverrides(data.overrides || []);
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to load permissions");
			}
		} catch (error) {
			console.error("Failed to load permissions:", error);
			toast.error("Failed to load permissions");
		} finally {
			setLoading(false);
		}
	};

	const loadRoles = async () => {
		try {
			const response = await fetch(`/api/roles?serverId=${serverId}`);
			if (response.ok) {
				const data = await response.json();
				setRoles(data.roles || []);
			}
		} catch (error) {
			console.error("Failed to load roles:", error);
		}
	};

	const handleCreateOverride = async () => {
		try {
			if (createType === "role" && !selectedRoleId) {
				toast.error("Please select a role");
				return;
			}
			if (createType === "user" && !selectedUserId) {
				toast.error("Please enter a user ID");
				return;
			}

			const response = await fetch("/api/channel-permissions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					channelId,
					...(createType === "role" ? { roleId: selectedRoleId } : { userId: selectedUserId }),
					allow: Array.from(allowPermissions),
					deny: Array.from(denyPermissions),
				}),
			});

			if (response.ok) {
				toast.success("Permission override created");
				await loadOverrides();
				setShowCreateDialog(false);
				resetCreateForm();
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to create override");
			}
		} catch (error) {
			console.error("Failed to create override:", error);
			toast.error("Failed to create override");
		}
	};

	const handleDeleteOverride = async (overrideId: string) => {
		try {
			const response = await fetch(`/api/channel-permissions?overrideId=${overrideId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("Permission override deleted");
				await loadOverrides();
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to delete override");
			}
		} catch (error) {
			console.error("Failed to delete override:", error);
			toast.error("Failed to delete override");
		}
	};

	const resetCreateForm = () => {
		setCreateType("role");
		setSelectedRoleId("");
		setSelectedUserId("");
		setAllowPermissions(new Set());
		setDenyPermissions(new Set());
	};

	const toggleAllow = (permission: Permission) => {
		const newAllow = new Set(allowPermissions);
		const newDeny = new Set(denyPermissions);
		
		if (newAllow.has(permission)) {
			newAllow.delete(permission);
		} else {
			newAllow.add(permission);
			newDeny.delete(permission); // Remove from deny if adding to allow
		}
		
		setAllowPermissions(newAllow);
		setDenyPermissions(newDeny);
	};

	const toggleDeny = (permission: Permission) => {
		const newAllow = new Set(allowPermissions);
		const newDeny = new Set(denyPermissions);
		
		if (newDeny.has(permission)) {
			newDeny.delete(permission);
		} else {
			newDeny.add(permission);
			newAllow.delete(permission); // Remove from allow if adding to deny
		}
		
		setAllowPermissions(newAllow);
		setDenyPermissions(newDeny);
	};

	const getRoleName = (roleId: string) => {
		return roles.find((r) => r.$id === roleId)?.name || roleId;
	};

	const getRoleColor = (roleId: string) => {
		return roles.find((r) => r.$id === roleId)?.color || "#888888";
	};

	const allPermissions = getAllPermissions();

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
					<DialogHeader>
						<DialogTitle>
							<Shield className="inline-block mr-2 h-5 w-5" />
							Channel Permissions - #{channelName}
						</DialogTitle>
						<DialogDescription>
							Set permission overrides for specific roles or users in this channel
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
								{overrides.length} {overrides.length === 1 ? "override" : "overrides"}
							</p>
							<Button onClick={() => setShowCreateDialog(true)} size="sm">
								<Plus className="mr-2 h-4 w-4" />
								Add Override
							</Button>
						</div>

						{loading ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								Loading permissions...
							</p>
						) : overrides.length === 0 ? (
							<Card>
								<CardContent className="pt-6">
									<p className="text-center text-sm text-muted-foreground py-8">
										No permission overrides set for this channel.
										<br />
										Using default role permissions.
									</p>
								</CardContent>
							</Card>
						) : (
							<div className="space-y-3">
								{overrides.map((override) => (
									<Card key={override.$id}>
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													{override.roleId ? (
														<>
															<Shield className="h-4 w-4" />
															<span
																className="font-medium"
																style={{ color: getRoleColor(override.roleId) }}
															>
																{getRoleName(override.roleId)}
															</span>
															<Badge variant="secondary">Role</Badge>
														</>
													) : (
														<>
															<UserIcon className="h-4 w-4" />
															<span className="font-medium">
																User: {override.userId?.slice(0, 8)}...
															</span>
															<Badge variant="secondary">User</Badge>
														</>
													)}
												</div>
												<Button
													onClick={() => handleDeleteOverride(override.$id)}
													size="sm"
													variant="ghost"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</CardHeader>
										<CardContent className="space-y-3">
											{override.allow.length > 0 && (
												<div>
													<p className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
														Allowed Permissions:
													</p>
													<div className="flex flex-wrap gap-1">
														{override.allow.map((perm) => (
															<Badge key={perm} variant="outline" className="text-green-600 border-green-600">
																{perm}
															</Badge>
														))}
													</div>
												</div>
											)}
											{override.deny.length > 0 && (
												<div>
													<p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">
														Denied Permissions:
													</p>
													<div className="flex flex-wrap gap-1">
														{override.deny.map((perm) => (
															<Badge key={perm} variant="outline" className="text-red-600 border-red-600">
																{perm}
															</Badge>
														))}
													</div>
												</div>
											)}
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{/* Create Override Dialog */}
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>Create Permission Override</DialogTitle>
						<DialogDescription>
							Set specific permissions for a role or user in #{channelName}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-4">
						{/* Type Selection */}
						<div className="space-y-2">
							<Label>Override Type</Label>
							<div className="grid grid-cols-2 gap-2">
								<Button
									onClick={() => setCreateType("role")}
									variant={createType === "role" ? "default" : "outline"}
									type="button"
								>
									<Shield className="mr-2 h-4 w-4" />
									Role
								</Button>
								<Button
									onClick={() => setCreateType("user")}
									variant={createType === "user" ? "default" : "outline"}
									type="button"
								>
									<UserIcon className="mr-2 h-4 w-4" />
									User
								</Button>
							</div>
						</div>

						{/* Role/User Selection */}
						{createType === "role" ? (
							<div className="space-y-2">
								<Label htmlFor="role-select">Select Role</Label>
								<select
									id="role-select"
									value={selectedRoleId}
									onChange={(e) => setSelectedRoleId(e.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2"
								>
									<option value="">-- Select a role --</option>
									{roles.map((role) => (
										<option key={role.$id} value={role.$id}>
											{role.name}
										</option>
									))}
								</select>
							</div>
						) : (
							<div className="space-y-2">
								<Label htmlFor="user-input">User ID</Label>
								<input
									id="user-input"
									type="text"
									placeholder="Enter user ID"
									value={selectedUserId}
									onChange={(e) => setSelectedUserId(e.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2"
								/>
							</div>
						)}

						{/* Permission Toggles */}
						<div className="space-y-3">
							<Label>Permissions</Label>
							<p className="text-sm text-muted-foreground">
								Set which permissions to allow or deny
							</p>
							<div className="space-y-2">
								{allPermissions.map((permission) => (
									<div
										key={permission}
										className="flex items-center justify-between rounded-lg border border-border p-3"
									>
										<div className="space-y-0.5 flex-1">
											<Label className="capitalize cursor-pointer">
												{permission.replace(/([A-Z])/g, " $1").trim()}
											</Label>
											<p className="text-xs text-muted-foreground">
												{getPermissionDescription(permission)}
											</p>
										</div>
										<div className="flex items-center gap-4">
											<div className="flex items-center gap-2">
												<Checkbox
													id={`allow-${permission}`}
													checked={allowPermissions.has(permission)}
													onCheckedChange={() => toggleAllow(permission)}
												/>
												<Label
													htmlFor={`allow-${permission}`}
													className="text-sm text-green-600 dark:text-green-400 cursor-pointer"
												>
													Allow
												</Label>
											</div>
											<div className="flex items-center gap-2">
												<Checkbox
													id={`deny-${permission}`}
													checked={denyPermissions.has(permission)}
													onCheckedChange={() => toggleDeny(permission)}
												/>
												<Label
													htmlFor={`deny-${permission}`}
													className="text-sm text-red-600 dark:text-red-400 cursor-pointer"
												>
													Deny
												</Label>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => {
								setShowCreateDialog(false);
								resetCreateForm();
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleCreateOverride}>
							Create Override
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
