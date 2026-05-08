import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { getInviteByCode, getServerPreview, validateInvite } from "@/lib/appwrite-invites";
import { Button } from "@/components/ui/button";
import { InvitePreviewClient } from "./InvitePreviewClient";

type InvitePageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;

  // Get the invite
  const invite = await getInviteByCode(code);
  if (!invite) {
    notFound();
  }

  // Validate the invite
  const validation = await validateInvite(code);
  if (!validation.valid) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full rounded-4xl border border-border/70 bg-card/85 p-8 text-center shadow-2xl backdrop-blur-sm sm:p-10">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <span className="text-2xl font-semibold">!</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Invalid Invite</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{validation.error}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="rounded-full">
              <a href="/chat">Go to Chat</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get server preview
  const serverPreview = await getServerPreview(invite.serverId);
  if (!serverPreview) {
    notFound();
  }

  // Check if user is authenticated
  const user = await getServerSession();

  // If authenticated and has ?auto=true, automatically redirect to join
  // This will be handled by the client component

  return (
    <InvitePreviewClient
      code={code}
      serverName={serverPreview.name}
      memberCount={serverPreview.memberCount}
      isAuthenticated={Boolean(user)}
    />
  );
}

export async function generateMetadata({ params }: InvitePageProps) {
  const { code } = await params;

  const invite = await getInviteByCode(code);
  if (!invite) {
    return {
      title: "Invalid Invite",
    };
  }

  const serverPreview = await getServerPreview(invite.serverId);
  if (!serverPreview) {
    return {
      title: "Invalid Invite",
    };
  }

  return {
    title: `Join ${serverPreview.name}`,
    description: `You've been invited to join ${serverPreview.name} with ${String(serverPreview.memberCount)} members.`,
  };
}
