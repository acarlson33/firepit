"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * MentionHelpTooltip - Shows a helpful tip about using @mentions
 * Appears once per session to guide new users
 */
export function MentionHelpTooltip() {
	const [isVisible, setIsVisible] = useState(() => {
		// Check if user has seen this tip before
		if (typeof window === "undefined") {
			return false;
		}
		return !localStorage.getItem("mentions-tip-seen");
	});

	const handleDismiss = () => {
		setIsVisible(false);
		if (typeof window !== "undefined") {
			localStorage.setItem("mentions-tip-seen", "true");
		}
	};

	if (!isVisible) {
		return null;
	}

	return (
		<div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-950/30">
			<div className="flex items-start gap-2">
				<Info className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
				<div className="flex-1 text-sm">
					<p className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
						💡 Tip: Mention users in your messages
					</p>
					<p className="mb-2 text-blue-800 dark:text-blue-200">
						Type <kbd className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs dark:bg-blue-900">@</kbd> 
						{" "}followed by a name to mention someone. They&apos;ll see a highlighted notification!
					</p>
					<p className="text-xs text-blue-700 dark:text-blue-300">
						Use arrow keys (↑↓) to navigate and press Enter to select.
					</p>
				</div>
				<Button
					onClick={handleDismiss}
					size="sm"
					variant="ghost"
					className="shrink-0 hover:bg-blue-100 dark:hover:bg-blue-900"
				>
					<X className="size-4" />
					<span className="sr-only">Dismiss tip</span>
				</Button>
			</div>
		</div>
	);
}
