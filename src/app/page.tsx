import Link from "next/link";
import {
    type LucideIcon,
    ArrowRight,
    Flame,
    MessageSquare,
    RadioTower,
    Settings,
    ShieldCheck,
    Sparkles,
    Users,
} from "lucide-react";

import { getUserRoleTags } from "@/lib/appwrite-roles";
import { getServerSession } from "@/lib/auth-server";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

type LandingFeature = {
    accentClass: string;
    description: string;
    icon: LucideIcon;
    title: string;
};

type LandingSignal = {
    label: string;
    value: string;
};

const publicFeatures: LandingFeature[] = [
    {
        accentClass: "from-primary/80 via-orange-300/60 to-transparent",
        description:
            "Channels, direct messages, threads, pins, and search now sit inside one calmer workspace.",
        icon: MessageSquare,
        title: "Conversation first",
    },
    {
        accentClass: "from-emerald-400/80 via-teal-300/60 to-transparent",
        description:
            "Servers, channels, categories, and invite flows stay easy to scan and quick to join.",
        icon: Users,
        title: "Community structure",
    },
    {
        accentClass: "from-amber-400/80 via-orange-200/60 to-transparent",
        description:
            "Moderation, reports, and role-aware controls remain visible without crowding the everyday chat flow.",
        icon: ShieldCheck,
        title: "Safer defaults",
    },
] as const;

const publicSignals: LandingSignal[] = [
    {
        label: "Activation",
        value: "Sign in, complete your profile, and join a space.",
    },
    {
        label: "Messaging",
        value: "Servers, DMs, threads, pins, and search share one model.",
    },
    {
        label: "Operations",
        value: "Roles, moderation, and audit visibility stay close at hand.",
    },
] as const;

function FeatureCard({ feature }: { feature: LandingFeature }) {
    return (
        <Card className="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/75 shadow-lg backdrop-blur-sm transition-transform hover:-translate-y-1">
            <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r ${feature.accentClass}`}
            />
            <CardHeader className="space-y-4 pb-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/70 text-primary shadow-sm">
                    <feature.icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-xl font-semibold tracking-tight">
                    {feature.title}
                </CardTitle>
                <CardDescription className="leading-6">
                    {feature.description}
                </CardDescription>
            </CardHeader>
        </Card>
    );
}

function SignalCard({ signal }: { signal: LandingSignal }) {
    return (
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {signal.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground">
                {signal.value}
            </p>
        </div>
    );
}

import type { Route } from "next";

interface WorkspaceActionButtonProps {
    href: Route;
    icon: LucideIcon;
    label: string;
    variant?: "default" | "outline" | "secondary";
}

function WorkspaceActionButton({
    href,
    icon: Icon,
    label,
    variant = "outline",
}: WorkspaceActionButtonProps) {
    return (
        <Button asChild className="w-full justify-start rounded-2xl" size="lg" variant={variant}>
            <Link href={href}>
                <Icon className="h-4 w-4" />
                {label}
            </Link>
        </Button>
    );
}

export default async function Home() {
    const user = await getServerSession();
    const roles = user ? await getUserRoleTags(user.$id) : null;

    if (!user) {
        return (
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                    <section className="relative overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)]"
                        />

                        <div className="relative space-y-8">
                            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                Firepit redesign
                            </div>

                            <div className="space-y-5">
                                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                    A cleaner home for real-time communities.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                    Firepit brings servers, direct messages, onboarding, moderation, and docs into one cohesive web workspace. The new visual direction favors calmer surfaces, clearer hierarchy, and faster daily navigation.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button asChild size="lg" className="group shadow-lg shadow-primary/15">
                                    <Link href="/login">
                                        Get started
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    size="lg"
                                    variant="outline"
                                    className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                                >
                                    <Link href="/chat">Preview the chat</Link>
                                </Button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                {publicSignals.map((signal) => (
                                    <SignalCard key={signal.label} signal={signal} />
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4">
                        {publicFeatures.map((feature) => (
                            <FeatureCard feature={feature} key={feature.title} />
                        ))}

                        <Card className="rounded-[1.75rem] border border-border/70 bg-card/75 shadow-lg backdrop-blur-sm">
                            <CardHeader className="space-y-2">
                                <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                    <Flame className="h-3.5 w-3.5 text-primary" />
                                    What changes here
                                </div>
                                <CardTitle className="text-xl font-semibold tracking-tight">
                                    One shell, fewer seams
                                </CardTitle>
                                <CardDescription className="leading-6">
                                    The redesign starts with the top-level shell and the landing path, then expands into chat, onboarding, settings, docs, and admin.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <p>• Branded surfaces with warmer, calmer color treatment.</p>
                                <p>• Clearer primary navigation for chat, docs, settings, and admin.</p>
                                <p>• Better first-run flow from login through onboarding and join paths.</p>
                            </CardContent>
                        </Card>
                    </section>
                </div>
            </div>
        );
    }

    const isAdmin = roles?.isAdmin ?? false;
    const isModerator = roles?.isModerator ?? false;
    const displayName = user.name?.trim() || "there";
    const roleLabel = isAdmin
        ? "Administrator"
        : isModerator
          ? "Moderator"
          : "Member";

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <section className="relative overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)]"
                    />

                    <div className="relative space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            <RadioTower className="h-3.5 w-3.5 text-primary" />
                            Welcome back
                        </div>

                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                Ready when you are, {displayName}.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Jump back into chat, review requests, or head straight to moderation and settings. The workspace is built to keep the important surfaces close together.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Role: {roleLabel}
                            </span>
                            {user.email ? (
                                <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    {user.email}
                                </span>
                            ) : null}
                            <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
                                <Users className="h-3.5 w-3.5" />
                                User ID {user.$id.slice(0, 8)}...
                            </span>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button asChild size="lg" className="group shadow-lg shadow-primary/15">
                                <Link href="/chat">
                                    Open chat
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                                className="rounded-full border-border/70 bg-background/70 backdrop-blur"
                            >
                                <Link href="/settings">Settings</Link>
                            </Button>
                            {isModerator || isAdmin ? (
                                <Button asChild size="lg" variant="secondary" className="rounded-full">
                                    <Link href="/moderation">Moderation</Link>
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4">
                    <Card className="rounded-[1.75rem] border border-border/70 bg-card/75 shadow-lg backdrop-blur-sm">
                        <CardHeader className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                Workspace shortcuts
                            </div>
                            <CardTitle className="text-xl font-semibold tracking-tight">
                                Jump back in
                            </CardTitle>
                            <CardDescription className="leading-6">
                                The redesigned shell keeps the most common actions within a single glance.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <WorkspaceActionButton
                                href="/chat"
                                icon={MessageSquare}
                                label="Open chat"
                                variant="default"
                            />
                            <WorkspaceActionButton
                                href="/settings"
                                icon={Settings}
                                label="Open settings"
                                variant="outline"
                            />
                            {isModerator || isAdmin ? (
                                <WorkspaceActionButton
                                    href="/moderation"
                                    icon={ShieldCheck}
                                    label="Open moderation"
                                    variant="secondary"
                                />
                            ) : null}
                            {isAdmin ? (
                                <WorkspaceActionButton
                                    href="/admin"
                                    icon={RadioTower}
                                    label="Open admin"
                                    variant="outline"
                                />
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border border-border/70 bg-card/75 shadow-lg backdrop-blur-sm">
                        <CardHeader className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <Flame className="h-3.5 w-3.5 text-primary" />
                                Account at a glance
                            </div>
                            <CardTitle className="text-xl font-semibold tracking-tight">
                                Identity and access
                            </CardTitle>
                            <CardDescription className="leading-6">
                                Quick reference for the account details that shape how Firepit personalizes the workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm">
                            {user.email ? (
                                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Email
                                    </p>
                                    <p className="mt-1 text-foreground">
                                        {user.email}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Email
                                    </p>
                                    <p className="mt-1 text-muted-foreground">Not provided</p>
                                </div>
                            )}
                            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    User ID
                                </p>
                                <p className="mt-1 break-all font-mono text-xs text-foreground">
                                    {user.$id}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Current role
                                </p>
                                <p className="mt-1 text-foreground">
                                    {roleLabel}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}