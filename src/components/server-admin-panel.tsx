"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Users, MessageSquare, Hash, Settings, Ban, UserX, AlertTriangle, Download, Filter, Link } from "lucide-react";
import { InviteManagerDialog } from "@/app/chat/components/InviteManagerDialog";
import { CreateInviteDialog } from "@/app/chat/components/CreateInviteDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ServerAdminPanelProps {
  serverId: string;
  serverName: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MemberData {
  userId: string;
  displayName?: string;
  userName?: string;
  avatarUrl?: string;
  roleIds: string[];
  joinedAt?: string;
  isBanned?: boolean;
  isMuted?: boolean;
}

interface AuditLog {
  $id: string;
  action: string;
  moderatorId: string;
  moderatorName?: string;
  targetUserId?: string;
  targetUserName?: string;
  reason?: string;
  timestamp: string;
  details?: string;
}

interface ServerStats {
  totalMembers: number;
  totalChannels: number;
  totalMessages: number;
  recentMessages: number;
  bannedUsers: number;
  mutedUsers: number;
}

export function ServerAdminPanel({
  serverId,
  serverName,
  isOwner,
  open,
  onOpenChange,
}: ServerAdminPanelProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [members, setMembers] = useState<MemberData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [filteredAuditLogs, setFilteredAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>("all");
  const [stats, setStats] = useState<ServerStats>({
    totalMembers: 0,
    totalChannels: 0,
    totalMessages: 0,
    recentMessages: 0,
    bannedUsers: 0,
    mutedUsers: 0,
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [moderationDialogOpen, setModerationDialogOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState<"ban" | "mute" | "kick" | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [inviteManagerOpen, setInviteManagerOpen] = useState(false);
  const [createInviteOpen, setCreateInviteOpen] = useState(false);

  const loadServerStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/servers/${serverId}/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load server stats:", error);
    }
  }, [serverId]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error("Failed to load members:", error);
      toast.error("Failed to load server members");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const response = await fetch(`/api/servers/${serverId}/audit-logs?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
        setFilteredAuditLogs(data);
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    }
  }, [serverId]);

  // Filter audit logs when filter changes
  useEffect(() => {
    if (auditFilter === "all") {
      setFilteredAuditLogs(auditLogs);
    } else {
      setFilteredAuditLogs(auditLogs.filter(log => log.action === auditFilter));
    }
  }, [auditFilter, auditLogs]);

  const exportAuditLogs = useCallback(async (format: "csv" | "json") => {
    try {
      const response = await fetch(`/api/servers/${serverId}/audit-logs/export?format=${format}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-logs-${serverId}-${new Date().toISOString().split("T")[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(`Audit logs exported as ${format.toUpperCase()}`);
      } else {
        toast.error("Failed to export audit logs");
      }
    } catch (error) {
      console.error("Failed to export audit logs:", error);
      toast.error("Failed to export audit logs");
    }
  }, [serverId]);

  useEffect(() => {
    if (open) {
      void loadServerStats();
      void loadMembers();
      void loadAuditLogs();
    }
  }, [open, loadServerStats, loadMembers, loadAuditLogs]);

  const handleModerationAction = async () => {
    if (!selectedMember || !moderationAction) {
      return;
    }

    try {
      const response = await fetch(`/api/servers/${serverId}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: moderationAction,
          userId: selectedMember.userId,
          reason: moderationReason,
        }),
      });

      if (response.ok) {
        toast.success(`Successfully ${moderationAction}ned ${selectedMember.displayName || selectedMember.userName}`);
        setModerationDialogOpen(false);
        setSelectedMember(null);
        setModerationReason("");
        void loadMembers();
        void loadAuditLogs();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to perform moderation action");
      }
    } catch (error) {
      console.error("Moderation action failed:", error);
      toast.error("Failed to perform moderation action");
    }
  };

  const openModerationDialog = (member: MemberData, action: "ban" | "mute" | "kick") => {
    setSelectedMember(member);
    setModerationAction(action);
    setModerationDialogOpen(true);
  };

  const filteredMembers = members.filter((m) => {
    if (!searchQuery) {
      return true;
    }
    const query = searchQuery.toLowerCase();
    return (
      m.displayName?.toLowerCase().includes(query) ||
      m.userName?.toLowerCase().includes(query) ||
      m.userId.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Server Admin Panel - {serverName}
          </DialogTitle>
          <DialogDescription>
            Manage server members, view moderation logs, and monitor server activity
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">
              <Settings className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Members
            </TabsTrigger>
            <TabsTrigger value="invites">
              <Link className="h-4 w-4 mr-2" />
              Invites
            </TabsTrigger>
            <TabsTrigger value="moderation">
              <Shield className="h-4 w-4 mr-2" />
              Moderation
            </TabsTrigger>
            <TabsTrigger value="audit">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="overview" className="space-y-4 m-0">
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Members</p>
                      <p className="text-2xl font-bold">{stats.totalMembers}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Hash className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Channels</p>
                      <p className="text-2xl font-bold">{stats.totalChannels}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-8 w-8 text-purple-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Messages</p>
                      <p className="text-2xl font-bold">{stats.totalMessages}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-8 w-8 text-orange-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Recent (24h)</p>
                      <p className="text-2xl font-bold">{stats.recentMessages}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Ban className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Banned Users</p>
                      <p className="text-2xl font-bold">{stats.bannedUsers}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <UserX className="h-8 w-8 text-yellow-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Muted Users</p>
                      <p className="text-2xl font-bold">{stats.mutedUsers}</p>
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Server Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Server ID:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{serverId}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your Role:</span>
                    <Badge variant={isOwner ? "default" : "secondary"}>
                      {isOwner ? "Owner" : "Administrator"}
                    </Badge>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="members" className="space-y-4 m-0">
              <div className="flex items-center gap-4">
                <Input
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <Badge variant="secondary">{filteredMembers.length} members</Badge>
              </div>

              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading members...</div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No members found</div>
                ) : (
                  filteredMembers.map((member) => (
                    <Card key={member.userId} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={member.avatarUrl}
                            alt={member.displayName || member.userName || "User"}
                            fallback={member.displayName || member.userName || "?"}
                            size="md"
                          />
                          <div>
                            <p className="font-medium">
                              {member.displayName || member.userName || member.userId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.roleIds.length} role{member.roleIds.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          {member.isBanned && (
                            <Badge variant="destructive" className="ml-2">Banned</Badge>
                          )}
                          {member.isMuted && (
                            <Badge variant="outline" className="ml-2">Muted</Badge>
                          )}
                        </div>
                        {isOwner && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openModerationDialog(member, "mute")}
                              disabled={member.isMuted}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Mute
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openModerationDialog(member, "kick")}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Kick
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openModerationDialog(member, "ban")}
                              disabled={member.isBanned}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Ban
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="invites" className="space-y-4 m-0">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Link className="h-5 w-5" />
                      Server Invites
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create and manage invite links for this server
                    </p>
                  </div>
                  <Button onClick={() => setCreateInviteOpen(true)}>
                    Create Invite
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-3">
                      Invites allow you to share links that let others join your server. You can customize expiration times, usage limits, and more.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setInviteManagerOpen(true)}
                      className="w-full"
                    >
                      <Link className="h-4 w-4 mr-2" />
                      Manage All Invites
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Quick Actions</p>
                      <div className="space-y-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCreateInviteOpen(true)}
                          className="w-full"
                        >
                          Create Instant Invite
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Features</p>
                      <ul className="text-xs space-y-1 mt-2">
                        <li>• Customizable expiration</li>
                        <li>• Usage limits</li>
                        <li>• Temporary membership</li>
                        <li>• Usage tracking</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="moderation" className="space-y-4 m-0">
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Moderation Tools
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use the Members tab to take moderation actions. This section shows recent activity.
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Banned Users</p>
                      <p className="text-sm text-muted-foreground">Users currently banned from this server</p>
                    </div>
                    <Badge variant="destructive">{stats.bannedUsers}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Muted Users</p>
                      <p className="text-sm text-muted-foreground">Users currently muted in this server</p>
                    </div>
                    <Badge variant="outline">{stats.mutedUsers}</Badge>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => setActiveTab("members")}>
                    <Users className="h-4 w-4 mr-2" />
                    Manage Members
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab("audit")}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    View Audit Log
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4 m-0">
              <Card className="p-4">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 flex-1">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={auditFilter} onValueChange={setAuditFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        <SelectItem value="ban">Ban</SelectItem>
                        <SelectItem value="unban">Unban</SelectItem>
                        <SelectItem value="mute">Mute</SelectItem>
                        <SelectItem value="unmute">Unmute</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="soft_delete">Soft Delete</SelectItem>
                        <SelectItem value="restore">Restore</SelectItem>
                        <SelectItem value="hard_delete">Hard Delete</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="outline">{filteredAuditLogs.length} logs</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void exportAuditLogs("csv")}
                      disabled={auditLogs.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void exportAuditLogs("json")}
                      disabled={auditLogs.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export JSON
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="space-y-2">
                {filteredAuditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {auditLogs.length === 0 ? "No audit logs yet" : "No logs match the selected filter"}
                  </div>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <Card key={log.$id} className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={
                              log.action === "ban" || log.action === "hard_delete" ? "destructive" :
                              log.action === "mute" ? "outline" :
                              log.action === "kick" || log.action === "soft_delete" ? "secondary" :
                              "default"
                            }>
                              {log.action}
                            </Badge>
                            <span className="text-sm font-medium">{log.moderatorName || "Moderator"}</span>
                            {log.targetUserName && (
                              <>
                                <span className="text-sm text-muted-foreground">→</span>
                                <span className="text-sm">{log.targetUserName}</span>
                              </>
                            )}
                          </div>
                          {log.reason && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Reason: {log.reason}
                            </p>
                          )}
                          {log.details && (
                            <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Moderation Action Dialog */}
      <Dialog open={moderationDialogOpen} onOpenChange={setModerationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moderationAction === "ban" && "Ban User"}
              {moderationAction === "mute" && "Mute User"}
              {moderationAction === "kick" && "Kick User"}
            </DialogTitle>
            <DialogDescription>
              {moderationAction === "ban" && "This will permanently ban the user from the server."}
              {moderationAction === "mute" && "This will prevent the user from sending messages."}
              {moderationAction === "kick" && "This will remove the user from the server."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>User</Label>
              <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded">
                <Avatar
                  src={selectedMember?.avatarUrl}
                  alt={selectedMember?.displayName || selectedMember?.userName || "User"}
                  fallback={selectedMember?.displayName || selectedMember?.userName || "?"}
                  size="sm"
                />
                <span className="font-medium">
                  {selectedMember?.displayName || selectedMember?.userName || selectedMember?.userId}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                placeholder="Enter reason for this action..."
                value={moderationReason}
                onChange={(e) => setModerationReason(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={moderationAction === "ban" ? "destructive" : "default"}
              onClick={handleModerationAction}
            >
              Confirm {moderationAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Management Dialogs */}
      <InviteManagerDialog
        open={inviteManagerOpen}
        onOpenChange={setInviteManagerOpen}
        serverId={serverId}
        onCreateInvite={() => {
          setInviteManagerOpen(false);
          setCreateInviteOpen(true);
        }}
      />

      <CreateInviteDialog
        open={createInviteOpen}
        onOpenChange={setCreateInviteOpen}
        serverId={serverId}
        onInviteCreated={() => {
          // Optionally reload invite list if manager is open
        }}
      />
    </Dialog>
  );
}
