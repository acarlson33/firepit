"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "working" | "done" | "error";

export function FlushCaches() {
	const [status, setStatus] = useState<Status>("idle");
	const [message, setMessage] = useState<string>("");

	const handleFlush = async () => {
		setStatus("working");
		setMessage("Clearing caches and unregistering service workers...");

		try {
			// Unregister all service workers
			if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(registrations.map((registration) => registration.unregister()));
			}

			// Delete all caches
			if (typeof caches !== "undefined") {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}

			setStatus("done");
			setMessage("Caches cleared. Please refresh the page to re-register the service worker.");
		} catch (error) {
			setStatus("error");
			const detail = error instanceof Error ? error.message : String(error);
			setMessage(`Failed to clear caches: ${detail}`);
		}
	};

	return (
		<div className="space-y-3">
			<Button
				type="button"
				onClick={handleFlush}
				disabled={status === "working"}
				className="w-full sm:w-auto"
			>
				{status === "working" ? "Clearing..." : "Flush caches and unregister"}
			</Button>
			{message ? (
				<p
					className="text-sm"
					aria-live="polite"
				>
					{message}
				</p>
			) : null}
		</div>
	);
}
