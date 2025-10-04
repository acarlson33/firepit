"use client";
import { useEffect, useState } from "react";

/**
 * SSR-compatible auth hook that fetches user info from server endpoint.
 * This avoids 401 errors from trying to use the browser SDK with httpOnly cookies.
 */
export function useAuth() {
	const [userId, setUserId] = useState<string | null>(null);
	const [userName, setUserName] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			try {
				// Fetch user info from server endpoint instead of using browser SDK
				// This works with SSR because the server can read the httpOnly cookie
				const response = await fetch("/api/me");
				
				if (response.ok) {
					const data = await response.json();
					setUserId(data.userId);
					setUserName(data.name || data.email);
				} else {
					// Not authenticated or session expired
					setUserId(null);
					setUserName(null);
				}
			} catch {
				// Middleware handles redirect; this is just for loading state
				setUserId(null);
				setUserName(null);
			} finally {
				setLoading(false);
			}
		})().catch(() => {});
	}, []);

	return { userId, userName, loading };
}
