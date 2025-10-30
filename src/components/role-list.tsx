"use client";

import { useState } from "react";
import { Plus, Settings, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/types";
import { calculateRoleHierarchy } from "@/lib/permissions";

type RoleListProperties = {
	roles: Role[];
	serverId: string;
	isOwner: boolean;
	onEditRole: (role: Role) => void;
	onCreateRole: () => void;
	onDeleteRole: (roleId: string) => void;
	onManageMembers: (role: Role) => void;
};

export function RoleList({
	roles,
	serverId,
	isOwner,
	onEditRole,
	onCreateRole,
	onDeleteRole,
	onManageMembers,
}: RoleListProperties) {
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const sortedRoles = calculateRoleHierarchy(roles);

	const handleDelete = (roleId: string) => {
		if (deletingId === roleId) {
			onDeleteRole(roleId);
			setDeletingId(null);
		} else {
			setDeletingId(roleId);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Server Roles</CardTitle>
						<CardDescription>
							Manage roles and permissions for your server
						</CardDescription>
					</div>
					{isOwner && (
						<Button onClick={onCreateRole} size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Create Role
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					{sortedRoles.length === 0 ? (
						<p className="text-center text-sm text-muted-foreground py-8">
							No roles created yet. Create your first role to get started.
						</p>
					) : (
						sortedRoles.map((role) => (
							<div
								key={role.$id}
								className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors hover:bg-muted/40"
							>
								{/* Color indicator */}
								<div
									className="h-8 w-1 rounded-full"
									style={{ backgroundColor: role.color }}
								/>

								{/* Role info */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">{role.name}</span>
										{role.administrator && (
											<Badge variant="destructive" className="text-xs">
												Admin
											</Badge>
										)}
										{role.mentionable && (
											<Badge variant="secondary" className="text-xs">
												Mentionable
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<span>Position: {role.position}</span>
										{role.memberCount !== undefined && (
											<span className="flex items-center gap-1">
												<Users className="h-3 w-3" />
												{role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
											</span>
										)}
									</div>
								</div>

								{/* Actions */}
								<div className="flex items-center gap-1">
									{isOwner && (
										<>
											<Button
												onClick={() => onManageMembers(role)}
												size="sm"
												variant="ghost"
												title="Manage members"
											>
												<Users className="h-4 w-4" />
											</Button>
											<Button
												onClick={() => onEditRole(role)}
												size="sm"
												variant="ghost"
												title="Edit role"
											>
												<Settings className="h-4 w-4" />
											</Button>
											<Button
												onClick={() => handleDelete(role.$id)}
												size="sm"
												variant={deletingId === role.$id ? "destructive" : "ghost"}
												title={deletingId === role.$id ? "Click again to confirm" : "Delete role"}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</>
									)}
								</div>
							</div>
						))
					)}
				</div>
			</CardContent>
		</Card>
	);
}
