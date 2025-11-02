"use client";

import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Role } from "@/lib/types";
import { RoleList } from "./role-list";
import { RoleEditor } from "./role-editor";
import { RoleMemberList } from "./role-member-list";

type RoleSettingsDialogProperties = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	serverId: string;
	serverName: string;
	isOwner: boolean;
};

export function RoleSettingsDialog({
	open,
	onOpenChange,
	serverId,
	serverName,
	isOwner,
}: RoleSettingsDialogProperties) {
	const [roles, setRoles] = useState<Role[]>([]);
	const [loading, setLoading] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [memberListOpen, setMemberListOpen] = useState(false);
	const [managingRole, setManagingRole] = useState<Role | null>(null);

	// Load roles when dialog opens
	useEffect(() => {
		if (open && serverId) {
			void loadRoles();
		}
	}, [open, serverId]);

	const loadRoles = async () => {
		setLoading(true);
		try {
			const response = await fetch(`/api/roles?serverId=${serverId}`);
			if (response.ok) {
				const data = await response.json();
				setRoles(data.roles || []);
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to load roles");
			}
		} catch (error) {
			console.error("Failed to load roles:", error);
			toast.error("Failed to load roles");
		} finally {
			setLoading(false);
		}
	};

	const handleCreateRole = () => {
		setEditingRole(null);
		setEditorOpen(true);
	};

	const handleEditRole = (role: Role) => {
		setEditingRole(role);
		setEditorOpen(true);
	};

	const handleSaveRole = async (roleData: Partial<Role>) => {
		try {
			const isUpdate = Boolean(roleData.$id);
			const response = await fetch("/api/roles", {
				method: isUpdate ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(roleData),
			});

			if (response.ok) {
				toast.success(isUpdate ? "Role updated successfully" : "Role created successfully");
				await loadRoles();
			} else {
				const error = await response.json();
				throw new Error(error.error || "Failed to save role");
			}
		} catch (error) {
			console.error("Failed to save role:", error);
			throw error;
		}
	};

	const handleDeleteRole = async (roleId: string) => {
		try {
			const response = await fetch(`/api/roles?roleId=${roleId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("Role deleted successfully");
				await loadRoles();
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to delete role");
			}
		} catch (error) {
			console.error("Failed to delete role:", error);
			toast.error("Failed to delete role");
		}
	};

	const handleManageMembers = (role: Role) => {
		setManagingRole(role);
		setMemberListOpen(true);
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
					<DialogHeader>
						<DialogTitle>Role Settings - {serverName}</DialogTitle>
						<DialogDescription>
							Manage roles and permissions for this server
						</DialogDescription>
					</DialogHeader>

					<div className="py-4">
						{loading ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								Loading roles...
							</p>
						) : (
							<RoleList
								roles={roles}
								serverId={serverId}
								isOwner={isOwner}
								onCreateRole={handleCreateRole}
								onEditRole={handleEditRole}
								onDeleteRole={handleDeleteRole}
								onManageMembers={handleManageMembers}
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<RoleEditor
				open={editorOpen}
				onOpenChange={setEditorOpen}
				role={editingRole}
				serverId={serverId}
				onSave={handleSaveRole}
			/>

			{managingRole && (
				<RoleMemberList
					open={memberListOpen}
					onOpenChange={setMemberListOpen}
					role={managingRole}
					serverId={serverId}
				/>
			)}
		</>
	);
}
