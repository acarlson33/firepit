"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  useEffect(() => {
    const autoJoin = searchParams.get("auto");
    if (autoJoin === "true" && isAuthenticated && !joining) {
      void handleJoin();
    }
  }, [searchParams, isAuthenticated]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
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
      router.push(`/chat?server=${String(serverId)}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to join server",
      );
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)]"
          />

          <div className="relative space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              Invite preview
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                {serverName}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Join the server, check the member count, and decide whether to
                sign in first or continue directly into the workspace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {String(memberCount)} members
              </span>
              <span className="inline-flex items-center rounded-full bg-muted/70 px-3 py-1 font-mono text-xs text-muted-foreground">
                {code}
              </span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleJoin}
                disabled={joining}
                className="rounded-full shadow-lg shadow-primary/15"
                size="lg"
              >
                {joining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : isAuthenticated ? (
                  "Join Server"
                ) : (
                  "Login to Join"
                )}
              </Button>

              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="/chat">Go to Chat</a>
              </Button>
            </div>
          </div>
        </section>

        <Card className="rounded-4xl border border-border/70 bg-card/75 shadow-xl backdrop-blur-sm">
          <CardHeader className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              Invite details
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              What happens next
            </CardTitle>
            <CardDescription className="leading-6">
              After you join, Firepit sends you straight into the server view so
              you can start reading or posting immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>• If you are not signed in, the join button routes you to login first.</p>
            <p>• The invite code is preserved for a return join flow.</p>
            <p>• Server membership and permissions still resolve server-side.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
