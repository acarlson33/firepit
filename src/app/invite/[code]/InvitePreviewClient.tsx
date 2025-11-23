"use client";

import { useEffect, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

type InvitePreviewClientProps = {
  code: string;
  serverName: string;
  memberCount: number;
  isAuthenticated: boolean;
};

export function InvitePreviewClient({
  code,
  serverName,
  memberCount,
  isAuthenticated,
}: InvitePreviewClientProps) {
  const [joining, setJoining] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-join if ?auto=true
  useEffect(() => {
    const autoJoin = searchParams.get("auto");
    if (autoJoin === "true" && isAuthenticated && !joining) {
      void handleJoin();
    }
  }, [searchParams, isAuthenticated]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      const returnUrl = `/invite/${code}?auto=true`;
      router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setJoining(true);
    try {
      const response = await fetch(`/api/invites/${code}/join`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to join server");
      }

      const { serverId } = await response.json();
      toast.success(`Successfully joined ${serverName}!`);

      // Redirect to the server
      router.push(`/chat?server=${String(serverId)}`);
    } catch (error) {
      console.error("Failed to join server:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to join server"
      );
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="bg-card border rounded-lg p-8 text-center shadow-lg">
          {/* Server Icon Placeholder */}
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-primary">
              {serverName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Server Name */}
          <h1 className="text-2xl font-bold mb-2">{serverName}</h1>

          {/* Member Count */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-6">
            <Users className="h-4 w-4" />
            <span>{String(memberCount)} members</span>
          </div>

          {/* Join Button */}
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full"
            size="lg"
          >
            {joining ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : isAuthenticated ? (
              "Join Server"
            ) : (
              "Login to Join"
            )}
          </Button>

          {/* Invite Code */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground mb-2">Invite Code</p>
            <code className="text-sm font-mono bg-muted px-3 py-1.5 rounded">
              {code}
            </code>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6">
          <a
            href="/chat"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Go to Chat
          </a>
        </div>
      </div>
    </div>
  );
}
