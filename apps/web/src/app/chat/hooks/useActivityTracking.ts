"use client";

import { useEffect, useRef } from "react";
import { setUserStatus, updateLastSeen, setOffline } from "@/lib/appwrite-status";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const LAST_SEEN_INTERVAL = 60 * 1000; // 60 seconds (reduced from 30s to save API calls)

type UseActivityTrackingProps = {
	userId: string | null;
	enabled?: boolean;
};

/**
 * Hook to track user activity and update status
 * 
 * NOTE: This hook is currently NOT in use to preserve manual status settings.
 * Users can manually set their status via the profile/settings UI.
 * 
 * If enabled, this hook would:
 * - Set status to "online" when active
 * - Set status to "away" after 5 minutes of inactivity
 * - Update lastSeen every 60 seconds
 * - Set status to "offline" on unmount/logout
 * 
 * @deprecated Automatic status tracking disabled to preserve manual statuses
 */
export function useActivityTracking({ userId, enabled = true }: UseActivityTrackingProps) {
	const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastSeenIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const isActiveRef = useRef(true);

	useEffect(() => {
		if (!userId || !enabled) {
			return;
		}

		// Set initial status to online (isManuallySet=false means it's auto-generated)
		// The API will preserve manually-set statuses that haven't expired
		void setUserStatus(userId, "online", undefined, undefined, false);
		isActiveRef.current = true;

		// Function to handle user activity
		function handleActivity() {
			if (!userId) {
				return;
			}

			// Clear existing inactivity timer
			if (inactivityTimerRef.current) {
				clearTimeout(inactivityTimerRef.current);
			}

			// If user was inactive, set back to online (auto-generated, not manual)
			if (!isActiveRef.current) {
				void setUserStatus(userId, "online", undefined, undefined, false);
				isActiveRef.current = true;
			}

			// Set new inactivity timer (auto-generated away status)
			inactivityTimerRef.current = setTimeout(() => {
				void setUserStatus(userId, "away", undefined, undefined, false);
				isActiveRef.current = false;
			}, INACTIVITY_TIMEOUT);
		}

		// Listen to user activity events (reduced to most important ones)
		const events = ["mousedown", "keydown"];
		for (const event of events) {
			window.addEventListener(event, handleActivity, { passive: true });
		}

		// Start inactivity timer
		handleActivity();

		// Update lastSeen periodically
		lastSeenIntervalRef.current = setInterval(() => {
			if (userId) {
				void updateLastSeen(userId);
			}
		}, LAST_SEEN_INTERVAL);

		// Cleanup
		return () => {
			// Remove event listeners
			for (const event of events) {
				window.removeEventListener(event, handleActivity);
			}

			// Clear timers
			if (inactivityTimerRef.current) {
				clearTimeout(inactivityTimerRef.current);
			}
			if (lastSeenIntervalRef.current) {
				clearInterval(lastSeenIntervalRef.current);
			}

			// Set status to offline
			if (userId) {
				void setOffline(userId);
			}
		};
	}, [userId, enabled]);
}
