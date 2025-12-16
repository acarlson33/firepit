"use client";

import { useState, useEffect, useCallback } from "react";
import type { NotificationSettings, NotificationLevel, MuteDuration } from "@/lib/types";

interface UseNotificationSettingsReturn {
	settings: NotificationSettings | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	updateSettings: (data: Partial<NotificationSettings>) => Promise<boolean>;
	muteChannel: (channelId: string, duration: MuteDuration, level?: NotificationLevel) => Promise<boolean>;
	unmuteChannel: (channelId: string) => Promise<boolean>;
	muteServer: (serverId: string, duration: MuteDuration, level?: NotificationLevel) => Promise<boolean>;
	unmuteServer: (serverId: string) => Promise<boolean>;
	muteConversation: (conversationId: string, duration: MuteDuration, level?: NotificationLevel) => Promise<boolean>;
	unmuteConversation: (conversationId: string) => Promise<boolean>;
}

/**
 * Hook to manage notification settings for the current user.
 * Provides methods for fetching, updating, and muting/unmuting.
 */
export function useNotificationSettings(): UseNotificationSettingsReturn {
	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchSettings = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await fetch("/api/notifications/settings");
			
			if (!response.ok) {
				const data = await response.json() as { error?: string };
				throw new Error(data.error ?? "Failed to fetch settings");
			}
			
			const data = await response.json() as NotificationSettings;
			setSettings(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch settings");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchSettings();
	}, [fetchSettings]);

	const updateSettings = useCallback(async (data: Partial<NotificationSettings>): Promise<boolean> => {
		try {
			const response = await fetch("/api/notifications/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to update settings");
			}

			const updatedSettings = await response.json() as NotificationSettings;
			setSettings(updatedSettings);
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update settings");
			return false;
		}
	}, []);

	const muteChannel = useCallback(async (
		channelId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	): Promise<boolean> => {
		try {
			const response = await fetch(`/api/channels/${channelId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: true, duration, level }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to mute channel");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to mute channel");
			return false;
		}
	}, [fetchSettings]);

	const unmuteChannel = useCallback(async (channelId: string): Promise<boolean> => {
		try {
			const response = await fetch(`/api/channels/${channelId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: false }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to unmute channel");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to unmute channel");
			return false;
		}
	}, [fetchSettings]);

	const muteServer = useCallback(async (
		serverId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	): Promise<boolean> => {
		try {
			const response = await fetch(`/api/servers/${serverId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: true, duration, level }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to mute server");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to mute server");
			return false;
		}
	}, [fetchSettings]);

	const unmuteServer = useCallback(async (serverId: string): Promise<boolean> => {
		try {
			const response = await fetch(`/api/servers/${serverId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: false }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to unmute server");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to unmute server");
			return false;
		}
	}, [fetchSettings]);

	const muteConversation = useCallback(async (
		conversationId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	): Promise<boolean> => {
		try {
			const response = await fetch(`/api/conversations/${conversationId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: true, duration, level }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to mute conversation");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to mute conversation");
			return false;
		}
	}, [fetchSettings]);

	const unmuteConversation = useCallback(async (conversationId: string): Promise<boolean> => {
		try {
			const response = await fetch(`/api/conversations/${conversationId}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ muted: false }),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to unmute conversation");
			}

			// Refetch settings to get updated overrides
			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to unmute conversation");
			return false;
		}
	}, [fetchSettings]);

	return {
		settings,
		loading,
		error,
		refetch: fetchSettings,
		updateSettings,
		muteChannel,
		unmuteChannel,
		muteServer,
		unmuteServer,
		muteConversation,
		unmuteConversation,
	};
}
