import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus, Sparkles, Users } from "lucide-react";

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
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8">
                <section className="grid gap-6 overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            Connections
                        </div>
                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Friends and requests, without the clutter.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Review incoming requests, keep sent invitations
                                in order, and jump into direct messages with the
                                people you talk to most.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="rounded-full shadow-lg shadow-primary/15">
                                <Link href="/chat?compose=1">
                                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                                    Add friend
                                </Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                                variant="outline"
                            >
                                <Link href="/settings">Privacy settings</Link>
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Quick overview
                        </div>
                        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                            <li className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                                Incoming requests land in the first tab.
                            </li>
                            <li className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                                Sent invites stay easy to cancel or revisit.
                            </li>
                            <li className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                                Privacy settings remain one click away.
                            </li>
                        </ul>
                    </div>
                </section>

                <FriendsSettings />
            </div>
        </div>
    );
}
