import Link from "next/link";
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

export default async function Home() {
	const user = await getServerSession();
	const roles = user ? await getUserRoleTags(user.$id) : null;

	// Non-authenticated state
	if (!user) {
		return (
			<div className="container mx-auto max-w-4xl px-4 py-8">
				<div className="grid gap-8">
					{/* Hero Section */}
					<section className="space-y-4 text-center">
						<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
							Welcome to QPC
						</h1>
						<p className="text-muted-foreground mx-auto max-w-2xl text-lg">
							A real-time chat platform built with Next.js and Appwrite. Connect
							with others, join servers, and engage in conversations.
						</p>
						<div className="flex flex-wrap justify-center gap-4 pt-4">
							<Button asChild size="lg">
								<Link href="/login">Get Started</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/chat">Browse Chat</Link>
							</Button>
						</div>
					</section>

					{/* Features Grid */}
					<section className="grid gap-6 md:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle>Real-time Chat</CardTitle>
								<CardDescription>
									Send and receive messages instantly with WebSocket support
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Experience seamless communication with live updates, typing
									indicators, and instant message delivery.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Server & Channels</CardTitle>
								<CardDescription>
									Organize conversations in dedicated spaces
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Create or join servers, set up channels for different topics,
									and keep your conversations organized.
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Moderation Tools</CardTitle>
								<CardDescription>
									Keep your community safe and friendly
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Built-in moderation features with message management, user
									roles, and comprehensive admin controls.
								</p>
							</CardContent>
						</Card>
					</section>
				</div>
			</div>
		);
	}

	// Authenticated state
	const isAdmin = roles?.isAdmin ?? false;
	const isModerator = roles?.isModerator ?? false;

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="grid gap-8">
				{/* Welcome Section */}
				<section className="space-y-4">
					<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
						Welcome back, {user.name}!
					</h1>
					<p className="text-muted-foreground text-lg">
						Jump into your conversations or explore new channels.
					</p>
				</section>

				{/* Quick Actions */}
				<section className="grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Chat</CardTitle>
							<CardDescription>
								Continue your conversations or start a new one
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								Browse servers, join channels, and chat with your community in
								real-time.
							</p>
						</CardContent>
						<CardFooter>
							<Button asChild className="w-full">
								<Link href="/chat">Open Chat</Link>
							</Button>
						</CardFooter>
					</Card>

					{(isModerator || isAdmin) && (
						<Card>
							<CardHeader>
								<CardTitle>Moderation Panel</CardTitle>
								<CardDescription>
									Manage messages and keep the community safe
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Review flagged messages, manage user content, and maintain
									community standards.
								</p>
							</CardContent>
							<CardFooter>
								<Button asChild className="w-full" variant="secondary">
									<Link href="/moderation">Open Panel</Link>
								</Button>
							</CardFooter>
						</Card>
					)}

					{isAdmin && (
						<Card>
							<CardHeader>
								<CardTitle>Admin Dashboard</CardTitle>
								<CardDescription>
									System management and administration
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Access advanced settings, manage users, configure servers, and
									monitor system health.
								</p>
							</CardContent>
							<CardFooter>
								<Button asChild className="w-full" variant="outline">
									<Link href="/admin">Admin Panel</Link>
								</Button>
							</CardFooter>
						</Card>
					)}
				</section>

				{/* Account Info */}
				<Card>
					<CardHeader>
						<CardTitle>Your Account</CardTitle>
						<CardDescription>Account information and settings</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
							<span className="text-muted-foreground font-medium">Email:</span>
							<span>{user.email}</span>
							<span className="text-muted-foreground font-medium">Role:</span>
							<span className="capitalize">
								{isAdmin
									? "Administrator"
									: isModerator
										? "Moderator"
										: "Member"}
							</span>
							<span className="text-muted-foreground font-medium">User ID:</span>
							<span className="font-mono text-xs">{user.$id}</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
