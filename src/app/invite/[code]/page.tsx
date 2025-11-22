import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { getInviteByCode, getServerPreview, validateInvite } from "@/lib/appwrite-invites";
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground mb-6">{validation.error}</p>
          <a
            href="/chat"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Chat
          </a>
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
