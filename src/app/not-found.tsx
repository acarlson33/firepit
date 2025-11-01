import Link from "next/link";
import { Home, Search, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-4">
			<div className="text-center">
			{/* 404 Heading */}
			<div className="mb-8 space-y-2">
				<h1 className="font-bold text-9xl text-primary">404</h1>
				<div className="h-1 w-full bg-linear-to-r from-transparent via-primary to-transparent" />
			</div>

		{/* Message */}
			<div className="mb-8 space-y-3">
				<h2 className="font-semibold text-3xl">Page Not Found</h2>
				<p className="mx-auto max-w-md text-muted-foreground">
					The page you&apos;re looking for doesn&apos;t exist or has been moved.
				</p>
			</div>				{/* Action Buttons */}
				<div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
					<Button asChild size="lg">
						<Link href="/">
							<Home className="mr-2 h-4 w-4" />
							Go Home
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline">
						<Link href="/chat">
							<MessageSquare className="mr-2 h-4 w-4" />
							Go to Chat
						</Link>
					</Button>
				</div>

				{/* Helpful Links */}
				<div className="mt-12 text-sm">
					<p className="mb-3 text-muted-foreground">Looking for something?</p>
					<div className="flex flex-wrap items-center justify-center gap-4">
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="/chat"
						>
							Chat
						</Link>
						<span className="text-muted-foreground">•</span>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="/settings"
						>
							Settings
						</Link>
						<span className="text-muted-foreground">•</span>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="/profile-debug"
						>
							Profile
						</Link>
					</div>
				</div>

				{/* Decorative Element */}
				<div className="mt-16 flex items-center justify-center gap-2 opacity-50">
					<Search className="h-6 w-6" />
					<p className="font-mono text-xs">ERROR_PAGE_NOT_FOUND</p>
				</div>
			</div>
		</div>
	);
}
