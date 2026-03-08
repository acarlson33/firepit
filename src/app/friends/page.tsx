import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus, Users } from "lucide-react";

import { FriendsSettings } from "@/components/friends-settings";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth-server";

export default async function FriendsPage() {
    const user = await requireAuth().catch(() => {
        redirect("/login");
    });

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
            <div className="grid gap-8">
                <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <Users className="h-3.5 w-3.5" />
                                Connections
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                                Friends and pending requests
                            </h1>
                            <p className="max-w-2xl text-muted-foreground">
                                Review incoming requests, keep track of sent
                                invitations, and jump into direct messages with
                                the people you care about most.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="rounded-2xl">
                                <Link href="/chat?compose=1">
                                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                                    Add friend
                                </Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-2xl"
                                variant="outline"
                            >
                                <Link href="/settings">Privacy settings</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                <FriendsSettings />
            </div>
        </div>
    );
}
