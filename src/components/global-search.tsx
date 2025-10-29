"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchResults } from "./search-results";
import type { Message, DirectMessage } from "@/lib/types";

type SearchResult = {
	type: "channel" | "dm";
	message: Message | DirectMessage;
};

type GlobalSearchProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const searchMessages = useCallback(async (searchQuery: string) => {
		if (searchQuery.trim().length < 2) {
			setResults([]);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/search/messages?q=${encodeURIComponent(searchQuery)}`,
			);

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to search messages");
			}

			const data = await response.json();
			setResults(data.results || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to search messages");
			setResults([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setResults([]);
			setError(null);
			return;
		}
	}, [open]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			if (query.trim().length >= 2) {
				searchMessages(query);
			} else {
				setResults([]);
			}
		}, 300);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [query, searchMessages]);

	const handleClear = () => {
		setQuery("");
		setResults([]);
		setError(null);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl max-h-[80vh] p-0">
				<DialogHeader className="px-6 pt-6 pb-4 border-b">
					<DialogTitle>Search Messages</DialogTitle>
				</DialogHeader>

				<div className="px-6 py-4 border-b">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input
							type="text"
							placeholder="Search... (try: from:@username, in:#channel, has:image, mentions:me, before:2024-01-01)"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="pl-10 pr-10"
							autoFocus
						/>
						{query && (
							<button
								type="button"
								onClick={handleClear}
								className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
								aria-label="Clear search"
							>
								<X className="size-4" />
							</button>
						)}
					</div>

					{query.trim().length > 0 && query.trim().length < 2 && (
						<p className="mt-2 text-muted-foreground text-sm">
							Type at least 2 characters to search
						</p>
					)}

					<div className="mt-3 flex flex-wrap gap-2 text-muted-foreground text-xs">
						<span className="font-medium">Filters:</span>
						<code className="rounded bg-muted px-1.5 py-0.5">
							from:@username
						</code>
						<code className="rounded bg-muted px-1.5 py-0.5">in:#channel</code>
						<code className="rounded bg-muted px-1.5 py-0.5">has:image</code>
						<code className="rounded bg-muted px-1.5 py-0.5">mentions:me</code>
						<code className="rounded bg-muted px-1.5 py-0.5">
							before:2024-01-01
						</code>
						<code className="rounded bg-muted px-1.5 py-0.5">
							after:2024-01-01
						</code>
					</div>
				</div>

				<div className="overflow-y-auto max-h-[50vh]">
					{error && (
						<div className="px-6 py-8 text-center text-destructive">
							{error}
						</div>
					)}

					{isLoading && (
						<div className="px-6 py-8 text-center text-muted-foreground">
							Searching...
						</div>
					)}

					{!isLoading && !error && query.trim().length >= 2 && results.length === 0 && (
						<div className="px-6 py-8 text-center text-muted-foreground">
							No results found
						</div>
					)}

					{!isLoading && !error && results.length > 0 && (
						<SearchResults results={results} onClose={() => onOpenChange(false)} />
					)}

					{!query && !isLoading && !error && (
						<div className="px-6 py-8 text-center text-muted-foreground">
							Start typing to search messages
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
