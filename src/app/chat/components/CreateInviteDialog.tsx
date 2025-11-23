"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type CreateInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  onInviteCreated: () => void;
};

const EXPIRATION_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
];

const MAX_USES_OPTIONS = [
  { value: "unlimited", label: "Unlimited" },
  { value: "1", label: "1 use" },
  { value: "5", label: "5 uses" },
  { value: "10", label: "10 uses" },
  { value: "25", label: "25 uses" },
  { value: "50", label: "50 uses" },
  { value: "100", label: "100 uses" },
];

export function CreateInviteDialog({
  open,
  onOpenChange,
  serverId,
  onInviteCreated,
}: CreateInviteDialogProps) {
  const [expiration, setExpiration] = useState("7d");
  const [maxUses, setMaxUses] = useState("unlimited");
  const [temporary, setTemporary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const calculateExpiresAt = (option: string): string | undefined => {
    if (option === "never") {
      return undefined;
    }

    const now = new Date();
    const duration = {
      "1h": 1 * 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
    }[option];

    if (!duration) {
      return undefined;
    }

    return new Date(now.getTime() + duration).toISOString();
  };

  const handleCreateInvite = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresAt: calculateExpiresAt(expiration),
          maxUses: maxUses === "unlimited" ? undefined : Number.parseInt(maxUses, 10),
          temporary,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create invite");
      }

      const invite = await response.json();
      setGeneratedCode(invite.code);

      toast.success("Invite link generated successfully");

      // Notify parent to refresh invite list
      onInviteCreated();
    } catch (error) {
      console.error("Failed to create invite:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create invite"
      );
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    if (!generatedCode) {
      return;
    }

    const inviteUrl = `${window.location.origin}/invite/${generatedCode}`;
    void navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied to clipboard");
  };

  const handleClose = () => {
    // Reset form
    setExpiration("7d");
    setMaxUses("unlimited");
    setTemporary(false);
    setGeneratedCode(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invite</DialogTitle>
          <DialogDescription>
            Generate an invite link for your server
          </DialogDescription>
        </DialogHeader>

        {generatedCode ? (
          // Show generated invite
          <div className="space-y-4">
            <div>
              <Label>Invite Link</Label>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded overflow-x-auto">
                  {`${window.location.origin}/invite/${generatedCode}`}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInviteLink}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          // Show create form
          <div className="space-y-4">
            <div>
              <Label htmlFor="expiration">Expiration</Label>
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger id="expiration" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="maxUses">Max Uses</Label>
              <Select value={maxUses} onValueChange={setMaxUses}>
                <SelectTrigger id="maxUses" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_USES_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="temporary"
                checked={temporary}
                onCheckedChange={(checked) => setTemporary(Boolean(checked))}
              />
              <Label htmlFor="temporary" className="cursor-pointer">
                Grant temporary membership (kicked when offline)
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreateInvite} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Generate Invite"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
