"use client";

import { useState, useEffect } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Role } from "@/lib/types";

type Member = {
	userId: string;
	userName?: string;
	displayName?: string;
	avatarUrl?: string;
	roleIds: string[];
};

type RoleMemberListProperties = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role: Role;
	serverId: string;
};

export function RoleMemberList({
	open,
	onOpenChange,
	role,
	serverId,
}: RoleMemberListProperties) {
	const [members, setMembers] = useState<Member[]>([]);
	const [allServerMembers, setAllServerMembers] = useState<Member[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [addSearchQuery, setAddSearchQuery] = useState("");

	useEffect(() => {
		if (open) {
			void loadMembers();
			void loadAllServerMembers();
		}
	}, [open, role.$id, serverId]);

	const loadMembers = async () => {
		setLoading(true);
		try {
			const response = await fetch(
				`/api/role-assignments?serverId=${serverId}&roleId=${role.$id}`
			);
			if (response.ok) {
				const data = await response.json();
				setMembers(data.members || []);
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to load members");
			}
		} catch (error) {
			console.error("Failed to load members:", error);
			toast.error("Failed to load members");
		} finally {
			setLoading(false);
		}
	};

	const loadAllServerMembers = async () => {
		try {
			const response = await fetch(`/api/servers/${serverId}/members`);
			if (response.ok) {
				const data = await response.json();
				setAllServerMembers(data.members || []);
			}
		} catch (error) {
			console.error("Failed to load server members:", error);
		}
	};

	const handleAddMember = async (userId: string) => {
		try {
			const response = await fetch("/api/role-assignments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					serverId,
					roleId: role.$id,
				}),
			});

			if (response.ok) {
				toast.success("Member added to role");
				await loadMembers();
				setShowAddDialog(false);
				setAddSearchQuery("");
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to add member");
			}
		} catch (error) {
			console.error("Failed to add member:", error);
			toast.error("Failed to add member");
		}
	};

	const handleRemoveMember = async (userId: string) => {
		try {
			const response = await fetch(
				`/api/role-assignments?userId=${userId}&serverId=${serverId}&roleId=${role.$id}`,
				{ method: "DELETE" }
			);

			if (response.ok) {
				toast.success("Member removed from role");
				await loadMembers();
			} else {
				const error = await response.json();
				toast.error(error.error || "Failed to remove member");
			}
		} catch (error) {
			console.error("Failed to remove member:", error);
			toast.error("Failed to remove member");
		}
	};

	const filteredMembers = members.filter((member) => {
		const searchLower = searchQuery.toLowerCase();
		return (
			member.displayName?.toLowerCase().includes(searchLower) ||
			member.userName?.toLowerCase().includes(searchLower) ||
			member.userId.toLowerCase().includes(searchLower)
		);
	});

	const availableMembers = allServerMembers.filter((member) => {
		const hasRole = member.roleIds.includes(role.$id);
		const searchLower = addSearchQuery.toLowerCase();
		const matchesSearch =
			!addSearchQuery ||
			member.displayName?.toLowerCase().includes(searchLower) ||
			member.userName?.toLowerCase().includes(searchLower) ||
			member.userId.toLowerCase().includes(searchLower);
		return !hasRole && matchesSearch;
	});

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>
							Members with Role:{" "}
							<span style={{ color: role.color }}>{role.name}</span>
						</DialogTitle>
						<DialogDescription>
							Manage which members have this role
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{/* Search and Add */}
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder="Search members..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-9"
								/>
							</div>
							<Button onClick={() => setShowAddDialog(true)} size="sm">
								<UserPlus className="mr-2 h-4 w-4" />
								Add Member
							</Button>
						</div>

						{/* Member List */}
						{loading ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								Loading members...
							</p>
						) : filteredMembers.length === 0 ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								{searchQuery
									? "No members found matching your search"
									: "No members have this role yet"}
							</p>
						) : (
							<div className="space-y-2">
								{filteredMembers.map((member) => (
									<div
										key={member.userId}
										className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3"
									>
										<Avatar
											alt={member.displayName || member.userName || member.userId}
											fallback={member.displayName || member.userName || member.userId}
											size="sm"
											src={member.avatarUrl}
										/>
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm truncate">
												{member.displayName || member.userName || "Unknown User"}
											</div>
											<div className="text-xs text-muted-foreground truncate">
												@{member.userName || member.userId.slice(0, 8)}
											</div>
										</div>
										<Button
											onClick={() => handleRemoveMember(member.userId)}
											size="sm"
											variant="ghost"
											title="Remove from role"
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>
						)}

						<div className="pt-4 text-sm text-muted-foreground">
							{filteredMembers.length}{" "}
							{filteredMembers.length === 1 ? "member" : "members"}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Add Member Dialog */}
			<Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
					<DialogHeader>
						<DialogTitle>Add Members to {role.name}</DialogTitle>
						<DialogDescription>
							Select members to add to this role
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search members..."
								value={addSearchQuery}
								onChange={(e) => setAddSearchQuery(e.target.value)}
								className="pl-9"
							/>
						</div>

						{availableMembers.length === 0 ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								{addSearchQuery
									? "No members found"
									: "All server members already have this role"}
							</p>
						) : (
							<div className="space-y-2 max-h-96 overflow-y-auto">
								{availableMembers.map((member) => (
									<button
										key={member.userId}
										onClick={() => handleAddMember(member.userId)}
										className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors hover:bg-muted/40"
										type="button"
									>
										<Avatar
											alt={member.displayName || member.userName || member.userId}
											fallback={member.displayName || member.userName || member.userId}
											size="sm"
											src={member.avatarUrl}
										/>
										<div className="min-w-0 flex-1 text-left">
											<div className="font-medium text-sm truncate">
												{member.displayName || member.userName || "Unknown User"}
											</div>
											<div className="text-xs text-muted-foreground truncate">
												@{member.userName || member.userId.slice(0, 8)}
											</div>
										</div>
										<UserPlus className="h-4 w-4 text-muted-foreground" />
									</button>
								))}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
