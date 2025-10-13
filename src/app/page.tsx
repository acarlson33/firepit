import Link from "next/link";
import { type LucideIcon, ArrowRight, MessageSquare, ShieldCheck, Users, Sparkles, RadioTower } from "lucide-react";

import { getServerSession } from "@/lib/auth-server";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const marketingFeatures: Array<{
	title: string;
	description: string;
	detail: string;
	icon: LucideIcon;
	accentClass: string;
}> = [
	{
		title: "Real-time Chat",
		description: "Send messages instantly with resilient, real-time infrastructure.",
		detail: "Live presence indicators, read receipts, and typing states keep every conversation feeling alive.",
		icon: MessageSquare,
		accentClass: "from-sky-400/60 via-sky-300/40 to-transparent",
	},
	{
		title: "Server Communities",
		description: "Spin up servers, curate channels, and unlock rich collaboration.",
		detail: "Fine-grained roles make it effortless to welcome people while keeping the chaos at bay.",
		icon: Users,
		accentClass: "from-emerald-400/60 via-emerald-300/40 to-transparent",
	},
	{
		title: "Built-in Safeguards",
		description: "Moderation flows help keep every space safe and welcoming.",
		detail: "Message auditing, escalation tools, and activity insights ship right out of the box.",
		icon: ShieldCheck,
		accentClass: "from-purple-400/60 via-purple-300/40 to-transparent",
	},
];

const communityStats = [
	{ label: "Teams exploring firepit", value: "120+" },
	{ label: "Messages processed per day", value: "2.4M" },
	{ label: "Latency to deliver", value: "<150ms" },
];

export default async function Home() {
	const user = await getServerSession();
	const roles = user ? await getUserRoleTags(user.$id) : null;

	// Non-authenticated state
	if (!user) {
		return (
			<div className="mx-auto w-full max-w-6xl px-6 py-12">
				<div className="grid gap-12">
					<section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur-sm">
						<div className="absolute -right-10 top-10 hidden h-40 w-40 rounded-full bg-gradient-to-br from-sky-200/70 via-purple-200/60 to-transparent blur-3xl dark:from-sky-500/20 dark:via-purple-500/20 lg:block" aria-hidden="true" />
						<div className="space-y-6 text-center lg:text-left">
							<span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
								<Sparkles className="h-3.5 w-3.5 text-sky-500" />
								Designed for communities that thrive
							</span>
							<h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
								Welcome to Firepit — where conversations stay alive
							</h1>
							<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
								Build vibrant communities with channels, direct messages, and thoughtful moderation tools that feel elegant from day one.
							</p>
							<div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center lg:justify-start">
								<Button asChild size="lg" className="group">
									<Link href="/login">
										Get started
										<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
									</Link>
								</Button>
								<Button asChild size="lg" variant="outline" className="border-border/70 bg-background/60 backdrop-blur">
									<Link href="/chat">Preview the chat</Link>
								</Button>
							</div>
							<dl className="grid gap-4 pt-6 sm:grid-cols-3">
								{communityStats.map((stat) => (
									<div key={stat.label} className="rounded-2xl border border-border/50 bg-background/60 px-4 py-5 text-center shadow-sm">
										<dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											{stat.label}
										</dt>
										<dd className="mt-2 text-2xl font-semibold">{stat.value}</dd>
									</div>
								))}
							</dl>
						</div>
					</section>

					<section className="grid gap-6 md:grid-cols-3">
						{marketingFeatures.map((feature) => (
							<Card
								key={feature.title}
								className="relative overflow-hidden border border-border/60 bg-card/70 shadow-lg backdrop-blur-sm transition-transform hover:-translate-y-1"
							>
								<div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${feature.accentClass}`} aria-hidden="true" />
								<CardHeader className="space-y-4">
									<span className="inline-flex items-center justify-center rounded-xl bg-muted/70 p-3 text-primary">
										<feature.icon className="h-5 w-5" />
									</span>
									<CardTitle className="text-xl font-semibold tracking-tight">
										{feature.title}
									</CardTitle>
									<CardDescription>{feature.description}</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground leading-relaxed">
										{feature.detail}
									</p>
								</CardContent>
							</Card>
						))}
					</section>
				</div>
			</div>
		);
	}

	// Authenticated state
	const isAdmin = roles?.isAdmin ?? false;
	const isModerator = roles?.isModerator ?? false;

	return (
		<div className="mx-auto w-full max-w-6xl px-6 py-12">
			<div className="grid gap-10">
				<section className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur">
					<div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-4">
							<span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
								<RadioTower className="h-4 w-4 text-emerald-500" />
								Welcome back
							</span>
							<h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
								Great to see you, {user.name || "there"}
							</h1>
							<p className="max-w-xl text-base text-muted-foreground">
								Your conversations, servers, and community tools are ready when you are. Jump back in or explore something new.
							</p>
							<div className="flex flex-wrap gap-3">
								<span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Role: {isAdmin ? "Administrator" : isModerator ? "Moderator" : "Member"}
								</span>
								{user.email && (
									<span className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
										<MessageSquare className="h-3.5 w-3.5" />
										{user.email}
									</span>
								)}
							</div>
						</div>
						<div className="grid gap-3 text-sm text-muted-foreground lg:text-right">
							<p className="font-medium text-foreground">Currently active permissions</p>
							<p className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 font-mono text-base tracking-tight text-foreground shadow-sm">
								{isAdmin ? "Instance wide control" : isModerator ? "Space Moderation" : "Chatting"}
							</p>
							<p className="text-xs">
								Need a status change? Update it directly from the header at any time.
							</p>
						</div>
					</div>
				</section>

				<section className="grid gap-6 md:grid-cols-2">
					<Card className="border border-border/60 bg-card/70 shadow-md transition-transform hover:-translate-y-1">
						<CardHeader>
							<CardTitle>Chat workspace</CardTitle>
							<CardDescription>
								Continue recent threads, or start a fresh conversation.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm leading-relaxed text-muted-foreground">
								Browse servers, discover channels, and collaborate with your community in real-time.
							</p>
						</CardContent>
						<CardFooter>
							<Button asChild className="w-full">
								<Link href="/chat" className="group inline-flex w-full items-center justify-center">
									Open chat
									<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
								</Link>
							</Button>
						</CardFooter>
					</Card>

					{(isModerator || isAdmin) && (
						<Card className="border border-border/60 bg-card/70 shadow-md transition-transform hover:-translate-y-1">
							<CardHeader>
								<CardTitle>Moderation tools</CardTitle>
								<CardDescription>
									Keep conversations constructive with built-in review flows.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm leading-relaxed text-muted-foreground">
									Review flagged content, act on reports, and keep the space healthy without leaving your flow.
								</p>
							</CardContent>
							<CardFooter>
								<Button asChild className="w-full" variant="secondary">
									<Link href="/moderation" className="group inline-flex w-full items-center justify-center">
										Open panel
										<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
									</Link>
								</Button>
							</CardFooter>
						</Card>
					)}

					{isAdmin && (
						<Card className="border border-border/60 bg-card/70 shadow-md transition-transform hover:-translate-y-1">
							<CardHeader>
								<CardTitle>Admin oversight</CardTitle>
								<CardDescription>
									Access system metrics, manage users, and configure instances.
							</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm leading-relaxed text-muted-foreground">
									Monitor server health, provision access, and fine-tune the experience across every space you run.
								</p>
							</CardContent>
							<CardFooter>
								<Button asChild className="w-full" variant="outline">
									<Link href="/admin" className="group inline-flex w-full items-center justify-center">
										Admin panel
										<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
									</Link>
								</Button>
							</CardFooter>
						</Card>
					)}
				</section>

				<Card className="border border-border/60 bg-card/70 shadow-lg">
					<CardHeader>
						<CardTitle>Your account at a glance</CardTitle>
						<CardDescription>Quick reference for personal details and audit IDs.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="rounded-2xl border border-border/50 bg-background/60 p-4">
								<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Email
								</p>
								<p className="mt-1 text-sm text-foreground">{user.email}</p>
							</div>
							<div className="rounded-2xl border border-border/50 bg-background/60 p-4">
								<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									User ID
								</p>
								<p className="mt-1 font-mono text-xs text-foreground break-all">{user.$id}</p>
							</div>
						</div>
						<div className="rounded-2xl border border-border/50 bg-background/60 p-4">
							<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current role</p>
							<p className="mt-1 text-sm text-foreground">
								{isAdmin ? "Administrator" : isModerator ? "Moderator" : "Member"}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
