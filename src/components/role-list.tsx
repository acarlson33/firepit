"use client";

import { useState } from "react";
import {
    Plus,
    Settings,
    Trash2,
    Users,
    ChevronRight,
    Shield,
} from "lucide-react";
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
    isOwner: boolean;
    onEditRole: (role: Role) => void;
    onCreateRole: () => void;
    onDeleteRole: (roleId: string) => void;
    onManageMembers: (role: Role) => void;
};

export function RoleList({
    roles,
    isOwner,
    onEditRole,
    onCreateRole,
    onDeleteRole,
    onManageMembers,
}: RoleListProperties) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const sortedRoles = calculateRoleHierarchy(roles);

    function getPermissionTags(role: Role) {
        if (role.administrator) {
            return [
                {
                    label: "All permissions",
                    className: "bg-destructive/10 text-destructive",
                },
            ];
        }

        const tags: { label: string; className: string }[] = [];
        if (role.manageServer) {
            tags.push({
                label: "Manage server",
                className:
                    "bg-orange-500/10 text-orange-600 dark:text-orange-400",
            });
        }
        if (role.manageChannels) {
            tags.push({
                label: "Manage channels",
                className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            });
        }
        if (role.manageMessages) {
            tags.push({
                label: "Manage messages",
                className: "bg-green-500/10 text-green-600 dark:text-green-400",
            });
        }
        if (role.sendMessages) {
            tags.push({
                label: "Can message",
                className: "bg-muted text-muted-foreground",
            });
        }
        return tags;
    }

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
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            No roles created yet. Create your first role to get
                            started.
                        </p>
                    ) : (
                        sortedRoles.map((role, index) => (
                            <div
                                key={role.$id}
                                className="group relative flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors hover:bg-muted/40"
                            >
                                {/* Hierarchy indicator */}
                                <div className="flex flex-col items-center gap-1">
                                    <div
                                        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                                        style={{
                                            backgroundColor: `${role.color}20`,
                                            color: role.color,
                                        }}
                                    >
                                        {index + 1}
                                    </div>
                                    {index < sortedRoles.length - 1 && (
                                        <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground/50" />
                                    )}
                                </div>

                                {/* Color indicator */}
                                <div
                                    className="h-8 w-1 rounded-full"
                                    style={{ backgroundColor: role.color }}
                                />

                                {/* Role info */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-sm">
                                            {role.name}
                                        </span>
                                        {role.administrator && (
                                            <Badge
                                                variant="destructive"
                                                className="text-xs"
                                            >
                                                <Shield className="mr-1 h-3 w-3" />
                                                Admin
                                            </Badge>
                                        )}
                                        {role.defaultOnJoin && (
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                Default
                                            </Badge>
                                        )}
                                        {role.mentionable && (
                                            <Badge
                                                variant="secondary"
                                                className="text-xs"
                                            >
                                                Mentionable
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span>
                                            {role.position === 0
                                                ? "Base level"
                                                : `Above ${role.position} role${role.position > 1 ? "s" : ""}`}
                                        </span>
                                        {role.memberCount !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {role.memberCount}{" "}
                                                {role.memberCount === 1
                                                    ? "member"
                                                    : "members"}
                                            </span>
                                        )}
                                    </div>
                                    {/* Permission preview */}
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {getPermissionTags(role).map((tag) => (
                                            <span
                                                key={tag.label}
                                                className={`rounded px-1.5 py-0.5 text-[10px] ${tag.className}`}
                                            >
                                                {tag.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    {isOwner && (
                                        <>
                                            <Button
                                                onClick={() =>
                                                    onManageMembers(role)
                                                }
                                                size="sm"
                                                variant="ghost"
                                                aria-label="Manage members"
                                            >
                                                <Users className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                onClick={() => onEditRole(role)}
                                                size="sm"
                                                variant="ghost"
                                                aria-label="Edit role"
                                            >
                                                <Settings className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                onClick={() =>
                                                    handleDelete(role.$id)
                                                }
                                                size="sm"
                                                variant={
                                                    deletingId === role.$id
                                                        ? "destructive"
                                                        : "ghost"
                                                }
                                                aria-label={
                                                    deletingId === role.$id
                                                        ? "Confirm delete role"
                                                        : "Delete role"
                                                }
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
