"use client";

import { useState, useEffect } from "react";
import { Copy, Trash2, Loader2, Plus, Clock, Users, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ServerInvite } from "@/lib/types";

type InviteManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  onCreateInvite: () => void;
};

export function InviteManagerDialog({
  open,
  onOpenChange,
  serverId,
  onCreateInvite,
}: InviteManagerDialogProps) {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Load invites when dialog opens
  useEffect(() => {
    if (open) {
      void loadInvites();
    }
  }, [open, serverId]);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/invites`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load invites");
      }
      const data = await response.json();
      setInvites(data);
    } catch (error) {
      console.error("Failed to load invites:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load invites"
      );
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const inviteUrl = `${window.location.origin}/invite/${code}`;
    void navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied to clipboard");
  };

  const deleteInvite = async (code: string) => {
    setDeleting(code);
    try {
      const response = await fetch(`/api/invites/${code}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete invite");
      }

      toast.success("Invite successfully revoked");

      // Reload invites
      await loadInvites();
    } catch (error) {
      console.error("Failed to delete invite:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete invite"
      );
    } finally {
      setDeleting(null);
    }
  };

  const formatExpiration = (expiresAt?: string) => {
    if (!expiresAt) {
      return "Never";
    }
    const date = new Date(expiresAt);
    const now = new Date();
    const isExpired = date < now;
    const formatted = date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return isExpired ? `Expired ${formatted}` : formatted;
  };

  const formatUses = (invite: ServerInvite) => {
    if (invite.maxUses === null || invite.maxUses === undefined) {
      return `${String(invite.currentUses)} uses`;
    }
    return `${String(invite.currentUses)}/${String(invite.maxUses)} uses`;
  };

  const isExpired = (invite: ServerInvite) => {
    if (!invite.expiresAt) {
      return false;
    }
    return new Date(invite.expiresAt) < new Date();
  };

  const isMaxedOut = (invite: ServerInvite) => {
    if (invite.maxUses === null || invite.maxUses === undefined) {
      return false;
    }
    return invite.currentUses >= invite.maxUses;
  };

  const isInactive = (invite: ServerInvite) => {
    return isExpired(invite) || isMaxedOut(invite);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Server Invites</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No invites yet</p>
              <Button onClick={onCreateInvite}>
                <Plus className="h-4 w-4 mr-2" />
                Create Invite
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.$id}
                  className={`border rounded-lg p-4 ${
                    isInactive(invite) ? "opacity-50 bg-muted/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Invite Code */}
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {invite.code}
                        </code>
                        {isExpired(invite) && (
                          <span className="text-xs text-destructive font-medium">
                            Expired
                          </span>
                        )}
                        {isMaxedOut(invite) && (
                          <span className="text-xs text-destructive font-medium">
                            Max uses reached
                          </span>
                        )}
                        {invite.temporary && (
                          <span className="text-xs text-blue-600 font-medium">
                            Temporary
                          </span>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span>{formatUses(invite)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatExpiration(invite.expiresAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            Created {new Date(invite.$createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInviteLink(invite.code)}
                        disabled={isInactive(invite)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteInvite(invite.code)}
                        disabled={deleting === invite.code}
                      >
                        {deleting === invite.code ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && invites.length > 0 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {invites.length} invite{invites.length === 1 ? "" : "s"}
            </p>
            <Button onClick={onCreateInvite}>
              <Plus className="h-4 w-4 mr-2" />
              Create Invite
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
